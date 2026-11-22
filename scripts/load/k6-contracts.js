import http from 'k6/http';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const contractsCompleted = new Counter('contracts_completed');
const contractWorkflowErrors = new Counter('contract_workflow_errors');
const contractWorkflowDuration = new Trend('contract_workflow_duration', true);
const syntheticPdf = '%PDF-1.4\n% Synthetic load-test document\n%%EOF\n';
const baseUrl = (__ENV.BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
const vus = Number(__ENV.K6_VUS || 100);
const duration = __ENV.K6_DURATION || '60s';

export const options = {
  scenarios: {
    signed_document_workflow: {
      executor: 'constant-vus',
      vus,
      duration,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    contracts_completed: ['rate>=7'],
  },
};

export function setup() {
  const response = http.post(`${baseUrl}/api/v1/auth/dev-token`, null, {
    tags: { endpoint: 'dev_token' },
  });
  const valid = check(response, {
    'development token issued': (result) => result.status === 200 && Boolean(result.json('accessToken')),
  });
  if (!valid) {
    throw new Error(`Could not obtain the local load-test token (HTTP ${response.status}).`);
  }

  return {
    token: response.json('accessToken'),
    runId: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  };
}

export default function (data) {
  const startedAt = Date.now();
  const headers = { Authorization: `Bearer ${data.token}` };
  const created = http.post(
    `${baseUrl}/api/v1/contracts`,
    JSON.stringify({
      businessReference: `load-${data.runId}-${__VU}-${__ITER}`,
      title: 'Contrato de prueba de carga',
    }),
    {
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      tags: { endpoint: 'create_contract' },
    },
  );

  const contractCreated = check(created, {
    'contract created': (result) => result.status === 201 && Boolean(result.json('id')),
  });
  if (!contractCreated) {
    contractWorkflowErrors.add(1);
    contractWorkflowDuration.add(Date.now() - startedAt);
    return;
  }

  const contractId = created.json('id');
  const uploaded = http.post(
    `${baseUrl}/api/v1/contracts/${contractId}/versions`,
    {
      file: http.file(syntheticPdf, 'load-test.pdf', 'application/pdf'),
    },
    { headers, tags: { endpoint: 'upload_pdf' } },
  );
  const documentVersionId = uploaded.status === 201 ? uploaded.json('documentVersionId') : null;
  const documentHash = uploaded.status === 201 ? uploaded.json('documentHash') : null;
  const uploadSucceeded = check(uploaded, {
    'PDF stored as immutable version': (result) => result.status === 201 && Boolean(documentVersionId && documentHash),
  });
  if (!uploadSucceeded) {
    contractWorkflowErrors.add(1);
    contractWorkflowDuration.add(Date.now() - startedAt);
    return;
  }

  const reviewed = http.post(
    `${baseUrl}/api/v1/contracts/${contractId}/versions/${documentVersionId}/review`,
    JSON.stringify({ documentHash }),
    {
      headers: { ...headers, 'Content-Type': 'application/json' },
      tags: { endpoint: 'review_hash' },
    },
  );
  if (!check(reviewed, { 'document hash reviewed': (result) => result.status === 204 })) {
    contractWorkflowErrors.add(1);
    contractWorkflowDuration.add(Date.now() - startedAt);
    return;
  }

  const signed = http.post(
    `${baseUrl}/api/v1/contracts/${contractId}/versions/${documentVersionId}/sign`,
    JSON.stringify({ documentHash, signerName: 'Synthetic Load Test', signerEmail: 'loadtest@dyxer.local' }),
    {
      headers: { ...headers, 'Content-Type': 'application/json' },
      tags: { endpoint: 'sign_and_enqueue' },
    },
  );
  const signAccepted = check(signed, {
    'signature accepted without waiting for Stellar': (result) => result.status === 202,
  });
  contractWorkflowDuration.add(Date.now() - startedAt);
  if (signAccepted) {
    contractsCompleted.add(1);
  } else {
    contractWorkflowErrors.add(1);
  }
}

export function handleSummary(data) {
  const completed = data.metrics.contracts_completed?.values.count || 0;
  const errors = data.metrics.contract_workflow_errors?.values.count || 0;
  const durationSeconds = (data.state.testRunDurationMs || 0) / 1000;
  const p95 = data.metrics.contract_workflow_duration?.values['p(95)'] || 0;
  const throughput = data.metrics.contracts_completed?.values.rate || 0;
  const requestErrorRate = data.metrics.http_req_failed?.values.rate || 0;
  const summary = {
    users: vus,
    requestedDuration: duration,
    measuredDurationSeconds: Number(durationSeconds.toFixed(2)),
    completedSignedWorkflows: completed,
    failedWorkflows: errors,
    contractsPerSecond: Number(throughput.toFixed(3)),
    p95WorkflowMs: Number(p95.toFixed(2)),
    httpRequestErrorRate: Number(requestErrorRate.toFixed(5)),
    targetBandContractsPerSecond: '7-10',
    targetMinimumMet: throughput >= 7,
    scope: 'Create contract, upload synthetic PDF to SeaweedFS, review SHA-256, record signer and enqueue PostgreSQL outbox; real Stellar confirmation is measured separately by a bounded Testnet smoke workflow.',
  };

  return {
    'k6-raw-summary.json': `${JSON.stringify(data, null, 2)}\n`,
    'load-test-summary.json': `${JSON.stringify(summary, null, 2)}\n`,
    stdout: `${JSON.stringify(summary, null, 2)}\n`,
  };
}

