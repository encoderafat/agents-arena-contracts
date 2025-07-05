// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Interface for Flow's On-chain Randomness
interface ICadenceArch {
    function revertibleRandom() external view returns (uint64);
}

// Enum and Struct for new Battle Tactics
enum Strategy { Balanced, Berserker, Tactician, Defensive }

struct BattleTactics {
    uint8 aggressiveness; // 0-100: How aggressive the agent fights
    Strategy strategy;   // Battle strategy choice
    uint8 riskTolerance; // 0-100: Willingness to take risks
}


// Interface for your AgentFactory
interface IAgentFactory {
    struct DNA {
        uint256 strength;
        uint256 agility;
        uint256 intelligence;
        uint8 elementalAffinity; // 0:Neutral, 1:Fire, 2:Water, 3:Earth, 4:Air
    }

    struct Agent {
        uint256 id;
        uint256 level;
        uint256 experience;
        DNA dna;
        string metadataCID;
        uint256 equippedItem;
    }

    function getAgent(uint256 tokenId) external view returns (Agent memory);
    function gainExperience(uint256 tokenId, uint256 xp) external;
}

// Interface for your ItemFactory
interface IItemFactory {
    function mint(address to, uint8 itemType, uint256 power) external returns (uint256);
}