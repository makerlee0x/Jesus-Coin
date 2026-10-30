// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { RateLimiter } from "@layerzerolabs/oapp-evm/contracts/oapp/utils/RateLimiter.sol";

/// @title Safety rails shared by the JESUS OFT pair
/// @notice - Outbound rate limit per destination chain (LayerZero `RateLimiter`, keyed by dstEid).
///         - Inbound rate limit per source chain (same linear-decay math, keyed by srcEid). On the Ethereum
///           adapter this caps how fast the lockbox can be emptied even if a forged message got verified.
///         - Pause: stops sends and receives. A paused receive reverts inside lzReceive, so the message stays
///           stored at the endpoint and can be retried after unpause; nothing is lost.
///         An eid with no limit configured has limit 0, so traffic is blocked until the owner sets one.
abstract contract BridgeGuards is RateLimiter, Pausable {
    /// @notice Address allowed to pause (e.g. a monitoring bot). Only the owner can unpause.
    address public pauser;

    /// @notice Inbound limits, keyed by source eid. Same layout as `rateLimits` (outbound).
    mapping(uint32 srcEid => RateLimit limit) public inboundRateLimits;

    event PauserSet(address pauser);
    event InboundRateLimitsChanged(RateLimitConfig[] rateLimitConfigs);

    error NotPauser();
    error InboundRateLimitExceeded();

    /// @dev Implemented by the concrete contract as its owner check.
    function _checkGuardAdmin() internal view virtual;

    modifier onlyGuardAdmin() {
        _checkGuardAdmin();
        _;
    }

    function setPauser(address _pauser) external onlyGuardAdmin {
        pauser = _pauser;
        emit PauserSet(_pauser);
    }

    function pause() external {
        if (msg.sender != pauser) _checkGuardAdmin();
        _pause();
    }

    function unpause() external onlyGuardAdmin {
        _unpause();
    }

    /// @param _configs dstEid / limit (local decimals) / window (seconds)
    function setRateLimits(RateLimitConfig[] calldata _configs) external onlyGuardAdmin {
        _setRateLimits(_configs);
    }

    function resetRateLimits(uint32[] calldata _eids) external onlyGuardAdmin {
        _resetRateLimits(_eids);
    }

    /// @param _configs dstEid field is read as the SOURCE eid / limit (local decimals) / window (seconds)
    function setInboundRateLimits(RateLimitConfig[] calldata _configs) external onlyGuardAdmin {
        for (uint256 i = 0; i < _configs.length; i++) {
            // Checkpoint first so a new decay rate is not applied retroactively.
            _inboundCheck(_configs[i].dstEid, 0);
            RateLimit storage rl = inboundRateLimits[_configs[i].dstEid];
            rl.limit = _configs[i].limit;
            rl.window = _configs[i].window;
        }
        emit InboundRateLimitsChanged(_configs);
    }

    function getInboundAmountCanBeReceived(
        uint32 _srcEid
    ) external view returns (uint256 currentAmountInFlight, uint256 amountCanBeReceived) {
        RateLimit memory rl = inboundRateLimits[_srcEid];
        return _amountCanBeSent(rl.amountInFlight, rl.lastUpdated, rl.limit, rl.window);
    }

    function _inboundCheck(uint32 _srcEid, uint256 _amount) internal {
        RateLimit storage rl = inboundRateLimits[_srcEid];
        (uint256 inFlight, uint256 canReceive) = _amountCanBeSent(rl.amountInFlight, rl.lastUpdated, rl.limit, rl.window);
        if (_amount > canReceive) revert InboundRateLimitExceeded();
        rl.amountInFlight = uint192(inFlight + _amount);
        rl.lastUpdated = uint64(block.timestamp);
    }
}
