// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ILandRegistry {
    function setUpdateManager(address _owner, address _operator, bool _approved) external;
}