// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// This is a mock interface for testing purposes.
// In a real scenario, this would be the actual interface for Flow's On-chain Randomness.
interface ICadenceArch {
    function revertibleRandom() external view returns (uint64);
}

// This mock contract allows us to control the random value returned,
// making tests deterministic and predictable.
contract MockCadenceArch is ICadenceArch {
    // Public variable to hold the fixed random value that will be returned.
    uint64 public fixedRandomValue;

    /**
     * @dev Constructor to initialize the mock contract with an initial random value.
     * @param _initialValue The initial fixed random value to be returned by revertibleRandom.
     */
    constructor(uint64 _initialValue) {
        fixedRandomValue = _initialValue;
    }

    /**
     * @dev Overrides the revertibleRandom function from the ICadenceArch interface.
     * Returns the currently set fixedRandomValue.
     * @return The fixed random value.
     */
    function revertibleRandom() external view override returns (uint64) {
        return fixedRandomValue;
    }

    /**
     * @dev Allows setting a new fixed random value for testing different scenarios.
     * @param _newValue The new fixed random value to set.
     */
    function setFixedRandomValue(uint64 _newValue) external {
        fixedRandomValue = _newValue;
    }
}
