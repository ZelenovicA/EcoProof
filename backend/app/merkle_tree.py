from __future__ import annotations

import json
from typing import List, Tuple

from Crypto.Hash import keccak as _keccak


def _keccak256(data: bytes) -> bytes:
    h = _keccak.new(digest_bits=256)
    h.update(data)
    return h.digest()


def _encode_packed_address_uint256(address: str, amount: int) -> bytes:
    """Reproduce abi.encodePacked(address, uint256)."""
    addr_bytes = bytes.fromhex(address[2:].lower().zfill(40))       # 20 bytes
    amount_bytes = amount.to_bytes(32, byteorder="big")             # 32 bytes
    return addr_bytes + amount_bytes


def _sorted_hash_pair(a: bytes, b: bytes) -> bytes:
    """OpenZeppelin MerkleProof uses sorted pairs."""
    if a <= b:
        return _keccak256(a + b)
    return _keccak256(b + a)


def build_merkle_tree(leaves: List[bytes]) -> Tuple[bytes, List[List[bytes]]]:
    """
    Build a Merkle tree from a list of leaf hashes.
    Returns (root, layers) where layers[0] = leaves.
    """
    if not leaves:
        return b"\x00" * 32, [[]]

    n = len(leaves)
    # Pad to next power of 2
    padded = list(leaves)
    while len(padded) & (len(padded) - 1):
        padded.append(padded[-1])

    layers: List[List[bytes]] = [padded]

    current = padded
    while len(current) > 1:
        next_layer = []
        for i in range(0, len(current), 2):
            next_layer.append(_sorted_hash_pair(current[i], current[i + 1]))
        layers.append(next_layer)
        current = next_layer

    root = current[0]
    return root, layers


def get_proof(layers: List[List[bytes]], leaf_index: int) -> List[bytes]:
    """Get the Merkle proof for a leaf at the given index."""
    proof: List[bytes] = []
    idx = leaf_index
    for layer in layers[:-1]:
        pair_idx = idx ^ 1  # sibling
        if pair_idx < len(layer):
            proof.append(layer[pair_idx])
        idx //= 2
    return proof


def generate_epoch(
    users: List[dict],
) -> dict:
    """
    Generate a full Merkle epoch from a list of user dicts:
        [{ "wallet_address": "0x...", "cumulative_amount": "123456..." }, ...]
    Returns {
        "merkle_root": "0x...",
        "allocations": [{ wallet_address, cumulative_amount, proof: ["0x..."] }],
        "ipfs_json": { ... },
        "total_rewards": "..."
    }
    """
    if not users:
        raise ValueError("No users to build tree from")

    # Sort deterministically by address
    users_sorted = sorted(users, key=lambda u: u["wallet_address"].lower())

    # Build leaves
    leaves: List[bytes] = []
    for u in users_sorted:
        leaf = _keccak256(
            _encode_packed_address_uint256(u["wallet_address"], int(u["cumulative_amount"]))
        )
        leaves.append(leaf)

    root, layers = build_merkle_tree(leaves)

    # Build per-user allocations with proofs
    allocations = []
    for i, u in enumerate(users_sorted):
        proof = get_proof(layers, i)
        allocations.append({
            "wallet_address": u["wallet_address"],
            "cumulative_amount": u["cumulative_amount"],
            "proof": ["0x" + p.hex() for p in proof],
        })

    total = sum(int(u["cumulative_amount"]) for u in users_sorted)

    merkle_root_hex = "0x" + root.hex()

    ipfs_json = {
        "merkle_root": merkle_root_hex,
        "total_rewards": str(total),
        "num_users": len(users_sorted),
        "allocations": allocations,
    }

    return {
        "merkle_root": merkle_root_hex,
        "allocations": allocations,
        "ipfs_json": ipfs_json,
        "total_rewards": str(total),
    }