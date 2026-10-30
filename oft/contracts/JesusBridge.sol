// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { OFTAdapter } from "@layerzerolabs/oft-evm/contracts/OFTAdapter.sol";
import { BridgeGuards } from "./BridgeGuards.sol";

/// @title JESUS OFT adapter (Ethereum side)
/// @notice Locks JESUS (0xba386A4Ca26B85FD057ab1Ef86e3DC7BdeB5ce70, 18 decimals, ~777.8T supply) on Ethereum and
///         releases it when JESUS comes back from another chain. The token itself is untouched; its ownership is
///         renounced and no token permission is needed.
/// @dev sharedDecimals = 4: OFT carries amounts as uint64 in shared decimals. With the LayerZero default of 6,
///      777.8T JESUS is 7.8e20 > uint64.max (1.8e19), so large sends would revert. At 4 the cap per message is
///      ~1.84 quadrillion JESUS, above the whole supply. Dust below 0.0001 JESUS stays with the sender.
contract JesusBridge is OFTAdapter, BridgeGuards {
    using SafeERC20 for IERC20;

    constructor(
        address _token,
        address _lzEndpoint,
        address _owner
    ) OFTAdapter(_token, _lzEndpoint, _owner) Ownable(_owner) {
        _setFee(100, _owner); // 1%
    }

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
        (amountSentLD, amountReceivedLD) = _debitView(_amountLD, _minAmountLD, _dstEid);
        // Lock what the other side mints; the fee goes straight to the fee recipient, so locked JESUS always
        // equals the supply on the other chains.
        innerToken.safeTransferFrom(_from, address(this), amountReceivedLD);
        if (amountSentLD > amountReceivedLD) innerToken.safeTransferFrom(_from, feeRecipient, amountSentLD - amountReceivedLD);
        _outflow(_dstEid, amountSentLD);
    }

    function _debitView(
        uint256 _amountLD,
        uint256 _minAmountLD,
        uint32 /*_dstEid*/
    ) internal view override returns (uint256 amountSentLD, uint256 amountReceivedLD) {
        amountSentLD = _removeDust(_amountLD);
        amountReceivedLD = _removeDust(_applyFee(amountSentLD));
        if (amountReceivedLD < _minAmountLD) revert SlippageExceeded(amountReceivedLD, _minAmountLD);
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
