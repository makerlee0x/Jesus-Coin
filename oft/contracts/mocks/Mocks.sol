// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { OFTAdapter } from "@layerzerolabs/oft-evm/contracts/OFTAdapter.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { EndpointV2Mock } from "@layerzerolabs/test-devtools-evm-hardhat/contracts/mocks/EndpointV2Mock.sol";

/// @dev Stand-in for Ethereum JESUS: 18 decimals, 777,777,777,777,777 supply.
contract MockJesus is ERC20 {
    constructor() ERC20("Jesus Coin", "JESUS") {
        _mint(msg.sender, 777_777_777_777_777 ether);
    }
}

/// @dev Plain adapter with LayerZero's default sharedDecimals (6), to show the overflow.
contract DefaultDecimalsAdapter is OFTAdapter {
    constructor(address _token, address _ep, address _owner) OFTAdapter(_token, _ep, _owner) Ownable(_owner) {}
}

/// @dev Re-exported so Hardhat compiles an artifact for it.
contract LzEndpointMock is EndpointV2Mock {
    constructor(uint32 _eid) EndpointV2Mock(_eid) {}
}
