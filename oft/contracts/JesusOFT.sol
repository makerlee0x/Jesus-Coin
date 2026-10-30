// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { OFT } from "@layerzerolabs/oft-evm/contracts/OFT.sol";
import { BridgeGuards } from "./BridgeGuards.sol";

/// @title JESUS OFT (Robinhood Chain side, or any other EVM chain)
/// @notice Minted when JESUS is locked in `JesusOFTAdapter` on Ethereum, burned when sent back. Total supply on
///         this chain can never exceed what is locked on Ethereum. 18 decimals, same as Ethereum JESUS.
/// @dev sharedDecimals must match the adapter (4). See JesusOFTAdapter for why.
contract JesusOFT is OFT, BridgeGuards {
    constructor(
        string memory _name,
        string memory _symbol,
        address _lzEndpoint,
        address _owner
    ) OFT(_name, _symbol, _lzEndpoint, _owner) Ownable(_owner) {}

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
