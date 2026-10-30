// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { OFTAdapter } from "@layerzerolabs/oft-evm/contracts/OFTAdapter.sol";
import { BridgeGuards } from "./BridgeGuards.sol";

/// @title JESUS OFT adapter (Ethereum side)
/// @notice Locks JESUS (0xba386A4Ca26B85FD057ab1Ef86e3DC7BdeB5ce70, 18 decimals, ~777.8T supply) on Ethereum and
///         releases it when JESUS comes back from another chain. The token itself is untouched; its ownership is
///         renounced and no token permission is needed.
/// @dev sharedDecimals = 4: OFT carries amounts as uint64 in shared decimals. With the LayerZero default of 6,
///      777.8T JESUS is 7.8e20 > uint64.max (1.8e19), so large sends would revert. At 4 the cap per message is
///      ~1.84 quadrillion JESUS, above the whole supply. Dust below 0.0001 JESUS stays with the sender.
contract JesusOFTAdapter is OFTAdapter, BridgeGuards {
    constructor(
        address _token,
        address _lzEndpoint,
        address _owner
    ) OFTAdapter(_token, _lzEndpoint, _owner) Ownable(_owner) {}

    function sharedDecimals() public pure override returns (uint8) {
        return 4;
    }

    function _checkGuardAdmin() internal view override {
        _checkOwner();
    }

    function _debit(
        address _from,
        uint256 _amountLD,
        uint256 _minAmountLD,
        uint32 _dstEid
    ) internal override whenNotPaused returns (uint256 amountSentLD, uint256 amountReceivedLD) {
        (amountSentLD, amountReceivedLD) = super._debit(_from, _amountLD, _minAmountLD, _dstEid);
        _outflow(_dstEid, amountSentLD);
    }

    function _credit(
        address _to,
        uint256 _amountLD,
        uint32 _srcEid
    ) internal override whenNotPaused returns (uint256 amountReceivedLD) {
        _inboundCheck(_srcEid, _amountLD);
        return super._credit(_to, _amountLD, _srcEid);
    }
}
