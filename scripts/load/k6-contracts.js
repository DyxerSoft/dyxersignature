import http from 'k6/http';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const contractsCompleted = new Counter('contracts_completed');
const contractWorkflowErrors = new Counter('contract_workflow_errors');
const contractWorkflowDuration = new Trend('contract_workflow_duration', true);
const downloadHttpStatus = new Trend('download_http_status');
const downloadErrorCode = new Trend('download_error_code');
const failedAt = {
  create: new Counter('workflow_failed_create'),
  upload: new Counter('workflow_failed_upload'),
  review: new Counter('workflow_failed_review'),
  sign: new Counter('workflow_failed_sign'),
  verify: new Counter('workflow_failed_verify'),
  link: new Counter('workflow_failed_download_link'),
  download: new Counter('workflow_failed_download'),
};
// A real single-page PDF with xref/trailer; avoid writing malformed PDF-header stubs.
function createContractPdf() {
  const commands = 'BT /F1 14 Tf 54 700 Td (Inmobiliaria Juanjo - Contrato de reserva) Tj ET\n';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length ' + commands.length + ' >>\nstream\n' + commands + 'endstream',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdf.length);
    pdf += (i + 1) + ' 0 obj\n' + objects[i] + '\nendobj\n';
  }
  const xref = pdf.length;
  pdf += 'xref\n0 ' + offsets.length + '\n0000000000 65535 f \n';
  for (const offset of offsets.slice(1)) {
    pdf += String(offset).padStart(10, '0') + ' 00000 n \n';
  }
  return pdf + 'trailer\n<< /Size ' + offsets.length + ' /Root 1 0 R >>\n' +
    'startxref\n' + xref + '\n%%EOF\n';
}
const syntheticPdf = createContractPdf();
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
    tags: { name: 'POST /api/v1/auth/dev-token', endpoint: 'dev_token' },
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
      tags: { name: 'POST /api/v1/contracts', endpoint: 'create_contract' },
    },
  );

  const contractCreated = check(created, {
    'contract created': (result) => result.status === 201 && Boolean(result.json('id')),
  });
  if (!contractCreated) {
    contractWorkflowErrors.add(1);
    failedAt.create.add(1);
    contractWorkflowDuration.add(Date.now() - startedAt);
    return;
  }

  const contractId = created.json('id');
  const uploaded = http.post(
    `${baseUrl}/api/v1/contracts/${contractId}/versions`,
    {
      file: http.file(syntheticPdf, 'load-test.pdf', 'application/pdf'),
    },
    { headers, tags: { name: 'POST /api/v1/contracts/:id/versions', endpoint: 'upload_pdf' } },
  );
  const documentVersionId = uploaded.status === 201 ? uploaded.json('documentVersionId') : null;
  const documentHash = uploaded.status === 201 ? uploaded.json('documentHash') : null;
  const uploadSucceeded = check(uploaded, {
    'PDF stored as immutable version': (result) => result.status === 201 && Boolean(documentVersionId && documentHash),
  });
  if (!uploadSucceeded) {
    contractWorkflowErrors.add(1);
    failedAt.upload.add(1);
    contractWorkflowDuration.add(Date.now() - startedAt);
    return;
  }

  const reviewed = http.post(
    `${baseUrl}/api/v1/contracts/${contractId}/versions/${documentVersionId}/review`,
    JSON.stringify({ documentHash }),
    {
      headers: { ...headers, 'Content-Type': 'application/json' },
      tags: { name: 'POST /api/v1/contracts/:id/versions/:versionId/review', endpoint: 'review_hash' },
    },
  );
  if (!check(reviewed, { 'document hash reviewed': (result) => result.status === 204 })) {
    contractWorkflowErrors.add(1);
    failedAt.review.add(1);
    contractWorkflowDuration.add(Date.now() - startedAt);
    return;
  }

  const signed = http.post(
    `${baseUrl}/api/v1/contracts/${contractId}/versions/${documentVersionId}/sign`,
    JSON.stringify({ documentHash, signerName: 'Synthetic Load Test', signerEmail: 'loadtest@dyxer.local' }),
    {
      headers: { ...headers, 'Content-Type': 'application/json' },
      tags: { name: 'POST /api/v1/contracts/:id/versions/:versionId/sign', endpoint: 'sign_and_enqueue' },
    },
  );
  const signAccepted = check(signed, {
    'signature accepted without waiting for Stellar': (result) => result.status === 202,
  });
  if (!signAccepted) {
    contractWorkflowErrors.add(1);
    failedAt.sign.add(1);
    contractWorkflowDuration.add(Date.now() - startedAt);
    return;
  }

  const verified = http.get(
    `${baseUrl}/api/v1/contracts/${contractId}/versions/${documentVersionId}/verify`,
    { headers, tags: { name: 'GET /api/v1/contracts/:id/versions/:versionId/verify', endpoint: 'verify_stored_pdf' } },
  );
  const contentMatches = check(verified, {
    'stored PDF hash verified while Stellar is pending': (result) =>
      result.status === 200 && result.json('contentMatches') === true,
  });
  if (!contentMatches) {
    contractWorkflowErrors.add(1);
    failedAt.verify.add(1);
    contractWorkflowDuration.add(Date.now() - startedAt);
    return;
  }

  const downloadLink = http.get(
    `${baseUrl}/api/v1/documents/${documentVersionId}/download`,
    { headers, tags: { name: 'GET /api/v1/documents/:versionId/download', endpoint: 'authorized_download_link' } },
  );
  const downloadUrl = downloadLink.status === 200 ? downloadLink.json('downloadUrl') : null;
  const linkIssued = check(downloadLink, {
    'authorized temporary download link issued': (result) => result.status === 200 && Boolean(downloadUrl),
  });
  if (!linkIssued) {
    contractWorkflowErrors.add(1);
    failedAt.link.add(1);
    contractWorkflowDuration.add(Date.now() - startedAt);
    return;
  }

  const downloaded = http.get(downloadUrl, { tags: { name: 'GET s3/presigned-pdf', endpoint: 'download_pdf' } });
  downloadHttpStatus.add(downloaded.status);
  downloadErrorCode.add(downloaded.error_code || 0);
  if (__VU === 1 && __ITER === 0) {
    console.log(`Download diagnostic: HTTP status ${downloaded.status}, k6 error code ${downloaded.error_code || 0}.`);
  }
  const pdfDownloaded = check(downloaded, {
    'private PDF downloaded from presigned URL': (result) =>
      result.status === 200 && result.body.startsWith('%PDF-'),
  });
  contractWorkflowDuration.add(Date.now() - startedAt);
  if (pdfDownloaded) {
    contractsCompleted.add(1);
  } else {
    contractWorkflowErrors.add(1);
    failedAt.download.add(1);
    const s3ErrorCode = downloaded.body?.match(/<Code>([^<]+)<\/Code>/)?.[1] || 'unavailable';
    if (__ITER === 0 && __VU <= 3) {
      console.error(`Presigned PDF download failed: HTTP ${downloaded.status}; S3 code ${s3ErrorCode}.`);
    }
  }
}

export function handleSummary(data) {
  const completed = data.metrics.contracts_completed?.values.count || 0;
  const errors = data.metrics.contract_workflow_errors?.values.count || 0;
  const durationSeconds = (data.state.testRunDurationMs || 0) / 1000;
  const p95 = data.metrics.contract_workflow_duration?.values['p(95)'] || 0;
  const throughput = data.metrics.contracts_completed?.values.rate || 0;
  const requestErrorRate = data.metrics.http_req_failed?.values.rate || 0;
  const downloadStatusSeries = Object.fromEntries(
    Object.entries(data.metrics)
      .filter(([name]) => name.startsWith('download_http_status'))
      .map(([name, metric]) => [name, metric.values]),
  );
  const downloadErrorCodeSeries = Object.fromEntries(
    Object.entries(data.metrics)
      .filter(([name]) => name.startsWith('download_error_code'))
      .map(([name, metric]) => [name, metric.values]),
  );
  const stageFailures = Object.fromEntries(
    Object.entries(failedAt).map(([stage, metric]) => [
      stage,
      data.metrics[metric.name]?.values.count || 0,
    ]),
  );
  const checks = (data.root_group?.checks || []).map(({ name, passes, fails }) => ({ name, passes, fails }));
  const summary = {
    users: vus,
    requestedDuration: duration,
    measuredDurationSeconds: Number(durationSeconds.toFixed(2)),
    completedSignedWorkflows: completed,
    failedWorkflows: errors,
    contractsPerSecond: Number(throughput.toFixed(3)),
    p95WorkflowMs: Number(p95.toFixed(2)),
    httpRequestErrorRate: Number(requestErrorRate.toFixed(5)),
    downloadHttpStatus: {
      average: Number((data.metrics.download_http_status?.values.avg || 0).toFixed(2)),
      p95: Number((data.metrics.download_http_status?.values['p(95)'] || 0).toFixed(2)),
    },
    downloadHttpStatusSeries: downloadStatusSeries,
    downloadErrorCodeSeries,
    stageFailures,
    checks,
    targetBandContractsPerSecond: '7-10',
    targetMinimumMet: throughput >= 7,
    scope: 'Create contract, upload synthetic PDF to SeaweedFS, review SHA-256, record signer and enqueue PostgreSQL outbox, verify stored bytes, authorize a temporary URL and download the private PDF; real Stellar confirmation is measured separately by a bounded Testnet smoke workflow.',
  };

  return {
    'k6-raw-summary.json': `${JSON.stringify(data, null, 2)}\n`,
    'load-test-summary.json': `${JSON.stringify(summary, null, 2)}\n`,
    stdout: `${JSON.stringify(summary, null, 2)}\n`,
  };
}

