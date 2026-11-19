// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title DyxerSignature Document Anchor
/// @notice MVP contract for immutable document/evidence anchoring.
/// @dev Contract state does not decide which business version is ACTIVE.
contract DocumentAnchor {
    address public immutable owner;

    struct AnchorRecord {
        bytes32 evidenceHash;
        uint64 anchoredAt;
    }

    mapping(bytes32 => AnchorRecord) private anchors;

    event DocumentAnchored(
        bytes32 indexed documentHash,
        bytes32 indexed evidenceHash,
        uint64 anchoredAt
    );

    error Unauthorized();
    error InvalidHash();
    error AlreadyAnchored();

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    function anchorDocument(
        bytes32 documentHash,
        bytes32 evidenceHash
    ) external onlyOwner {
        if (documentHash == bytes32(0) || evidenceHash == bytes32(0)) {
            revert InvalidHash();
        }

        if (anchors[documentHash].anchoredAt != 0) {
            revert AlreadyAnchored();
        }

        uint64 timestamp = uint64(block.timestamp);
        anchors[documentHash] = AnchorRecord({
            evidenceHash: evidenceHash,
            anchoredAt: timestamp
        });

        emit DocumentAnchored(documentHash, evidenceHash, timestamp);
    }

    function getAnchor(
        bytes32 documentHash
    ) external view returns (bytes32 evidenceHash, uint64 anchoredAt) {
        AnchorRecord memory record = anchors[documentHash];
        return (record.evidenceHash, record.anchoredAt);
    }

    function isAnchored(bytes32 documentHash) external view returns (bool) {
        return anchors[documentHash].anchoredAt != 0;
    }
}
