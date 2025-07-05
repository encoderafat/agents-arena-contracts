// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./Interfaces.sol";

contract Arena {
    IAgentFactory public agentFactory;
    address public cadenceArch;

    enum ArenaType { NeutralFields, VolcanicPlains, MysticForest }
    enum BattleStatus { Ongoing, Finished }

    struct Battle {
        uint256 battleId;
        uint256[] agentIds;
        BattleTactics[] tactics; // Store tactics for the battle
        ArenaType arena;
        BattleStatus status;
        uint256 winner;
    }

    struct BattleView {
        uint256 battleId;
        uint256[] agentIds;
        uint256[] agentHealths;
        BattleTactics[] tactics;
        ArenaType arena;
        BattleStatus status;
        uint256 winner;
    }

    struct AttackParameters {
        IAgentFactory.Agent attacker;
        BattleTactics attackerTactics;
        IAgentFactory.Agent defender;
        BattleTactics defenderTactics;
        ArenaType arena;
        bytes32 randomSeed;
    }

    Battle[] public battles;
    mapping(uint256 => mapping(uint256 => uint256)) public battleAgentHealth; // battleId => agentId => health
    mapping(uint256 => bool) public agentInBattle; // Prevent agent from being in multiple battles

    event BattleStarted(uint256 battleId, uint256 agent1, uint256 agent2, ArenaType arena);
    event Attack(uint256 indexed battleId, uint256 indexed attacker, uint256 indexed defender, uint256 damage);
    event BattleFinished(uint256 indexed battleId, uint256 indexed winner, uint256 indexed loser);

    constructor(address _agentFactoryAddress, address _cadenceArch) {
        agentFactory = IAgentFactory(_agentFactoryAddress);
        cadenceArch = _cadenceArch;
    }

    function startBattle(
        uint256 _agent1Id,
        BattleTactics memory _tactics1,
        uint256 _agent2Id,
        BattleTactics memory _tactics2
    ) public {
        
        IAgentFactory.Agent memory agent1 = agentFactory.getAgent(_agent1Id);
        IAgentFactory.Agent memory agent2 = agentFactory.getAgent(_agent2Id);
        require(agent1.id != 0 && agent2.id != 0, "Agent does not exist");
        require(_tactics1.aggressiveness <= 100 && _tactics2.aggressiveness <= 100, "Invalid aggressiveness");
        require(_tactics1.riskTolerance <= 100 && _tactics2.riskTolerance <= 100, "Invalid risk tolerance");


        uint256 battleId = battles.length;

        uint64 randomValue = ICadenceArch(cadenceArch).revertibleRandom();
        ArenaType arenaType = ArenaType(randomValue % 3);

        uint256[] memory agentIds = new uint256[](2);
        agentIds[0] = _agent1Id;
        agentIds[1] = _agent2Id;

        BattleTactics[] memory tactics = new BattleTactics[](2);
        tactics[0] = _tactics1;
        tactics[1] = _tactics2;

        battles.push(Battle({
            battleId: battleId,
            agentIds: agentIds,
            tactics: tactics,
            arena: arenaType,
            status: BattleStatus.Ongoing,
            winner: 0
        }));
        
        uint256 health1 = agent1.level * 20 + agent1.dna.strength * 5;
        uint256 health2 = agent2.level * 20 + agent2.dna.strength * 5;
        battleAgentHealth[battleId][_agent1Id] = health1;
        battleAgentHealth[battleId][_agent2Id] = health2;

        emit BattleStarted(battleId, _agent1Id, _agent2Id, arenaType);
    }

    function fight(uint256 _battleId) public {
        require(_battleId < battles.length, "Battle does not exist");
        Battle storage currentBattle = battles[_battleId];
        require(currentBattle.status == BattleStatus.Ongoing, "Battle is already finished");

        uint256 agent1Id = currentBattle.agentIds[0];
        uint256 agent2Id = currentBattle.agentIds[1];
        require(!agentInBattle[agent1Id] && !agentInBattle[agent2Id], "Agent already in battle");

        agentInBattle[agent1Id] = true;
        agentInBattle[agent2Id] = true;
        
        IAgentFactory.Agent memory agent1 = agentFactory.getAgent(agent1Id);
        IAgentFactory.Agent memory agent2 = agentFactory.getAgent(agent2Id);

        uint256 health1 = battleAgentHealth[_battleId][agent1Id];
        uint256 health2 = battleAgentHealth[_battleId][agent2Id];

        uint256 winnerId;
        uint256 loserId;

        // Use a VRF seed for the entire battle's sequence of events
        bytes32 randomSeed = keccak256(abi.encodePacked(ICadenceArch(cadenceArch).revertibleRandom(), _battleId));

        // Simulate 3 rounds of combat
        for (uint i = 0; i < 3; i++) {
            // Create AttackParameters for agent1's attack
            AttackParameters memory attackParams1 = AttackParameters({
                attacker: agent1,
                attackerTactics: currentBattle.tactics[0],
                defender: agent2,
                defenderTactics: currentBattle.tactics[1],
                arena: currentBattle.arena,
                randomSeed: randomSeed
            });

            // Agent 1 attacks Agent 2
            uint256 damageTo2 = _resolveAttackAndGetDamage(attackParams1);
            health2 = (damageTo2 >= health2) ? 0 : (health2 - damageTo2);
            emit Attack(_battleId, agent1Id, agent2Id, damageTo2);
            if (health2 == 0) {
                winnerId = agent1Id;
                loserId = agent2Id;
                break;
            }

            // Update seed for the next action to ensure fairness and prevent mirroring
            randomSeed = keccak256(abi.encodePacked(randomSeed));

            // Create AttackParameters for agent2's attack
            AttackParameters memory attackParams2 = AttackParameters({
                attacker: agent2,
                attackerTactics: currentBattle.tactics[1],
                defender: agent1,
                defenderTactics: currentBattle.tactics[0],
                arena: currentBattle.arena,
                randomSeed: randomSeed
            });

            // Agent 2 attacks Agent 1
            uint256 damageTo1 = _resolveAttackAndGetDamage(attackParams2);
            health1 = (damageTo1 >= health1) ? 0 : (health1 - damageTo1);
            emit Attack(_battleId, agent2Id, agent1Id, damageTo1);
            if (health1 == 0) {
                winnerId = agent2Id;
                loserId = agent1Id;
                break;
            }
            randomSeed = keccak256(abi.encodePacked(randomSeed));
        }

        // If no winner after 3 rounds, winner is one with more health %
        if (winnerId == 0) {
            uint256 initialHealth1 = agent1.level * 20 + agent1.dna.strength * 5;
            uint256 initialHealth2 = agent2.level * 20 + agent2.dna.strength * 5;
            if ((health1 * 100) / initialHealth1 >= (health2 * 100) / initialHealth2) {
                winnerId = agent1Id;
                loserId = agent2Id;
            } else {
                winnerId = agent2Id;
                loserId = agent1Id;
            }
        }

        // Finalize battle
        currentBattle.status = BattleStatus.Finished;
        currentBattle.winner = winnerId;
        agentInBattle[agent1Id] = false;
        agentInBattle[agent2Id] = false;
        agentFactory.gainExperience(winnerId, 50); // Winner gets 50 XP
        emit BattleFinished(_battleId, winnerId, loserId);
    }

    
    function _resolveAttackAndGetDamage(AttackParameters memory params) internal pure returns (uint256) {
        // 1. Base Power Calculation
        uint256 attackPower = params.attacker.dna.strength * 2 + params.attacker.dna.intelligence;
        uint256 defensePower = params.defender.dna.strength + params.defender.dna.intelligence * 2;

        // 2. Apply Strategy & Aggressiveness Modifiers
        // Modifiers are parts-per-100. 100 is neutral.
        uint256 attackModifier = 100;
        uint256 defenseModifier = 100;

        // Apply attacker's strategy
        if (params.attackerTactics.strategy == Strategy.Berserker) { attackModifier += 30; } // +30% attack
        else if (params.attackerTactics.strategy == Strategy.Tactician) { attackModifier += 15; defenseModifier += 15; } // +15% attack/defense

        // Apply defender's strategy
        if (params.defenderTactics.strategy == Strategy.Defensive) { defenseModifier += 30; } // +30% defense

        // Apply aggressiveness (affects both attacker and defender)
        attackModifier += (params.attackerTactics.aggressiveness / 4); // Up to +25%
        defenseModifier -= (params.attackerTactics.aggressiveness / 4); // Up to -25%

        attackPower = (attackPower * attackModifier) / 100;
        defensePower = (defensePower * defenseModifier) / 100;

        // 3. Calculate Damage Pre-Mitigation
        if (attackPower <= defensePower) { return 1; } // Always do at least 1 damage on a hit
        uint256 damage = attackPower - defensePower;

        // 4. Evasion Check (based on defender's agility)
        uint256 evasionRoll = uint256(uint160(bytes20(params.randomSeed))) % 100;
        // Agility gives a direct % chance to evade, capped at 50%
        uint256 evasionChance = params.defender.dna.agility > 50 ? 50 : params.defender.dna.agility;
        if (evasionRoll < evasionChance) { return 0; } // Successful evasion

        // 5. Critical Hit / Fumble (based on attacker's risk tolerance)
        uint256 luckRoll = (uint256(uint160(bytes20(params.randomSeed << 160)))) % 100;
        uint256 critChance = params.attackerTactics.riskTolerance / 2; // Max 50%
        uint256 fumbleChance = (100 - params.attackerTactics.riskTolerance) / 4; // Max 25%

        if (luckRoll < critChance) { damage = (damage * 15) / 10; } // Critical hit: +50% damage
        else if (luckRoll > (100 - fumbleChance)) { damage = (damage * 5) / 10; } // Fumble: -50% damage

        // 6. Arena Bonus
        if (params.arena == ArenaType.VolcanicPlains && params.attacker.dna.elementalAffinity == 1) { // Fire
            damage = (damage * 115) / 100; // +15%
        } else if (params.arena == ArenaType.MysticForest && (params.attacker.dna.elementalAffinity == 3 || params.attacker.dna.elementalAffinity == 4)) { // Earth or Air
            damage = (damage * 115) / 100; // +15%
        }

        return damage;
    }


    function getBattle(uint256 _battleId) public view returns (BattleView memory) {
        require(_battleId < battles.length, "Battle does not exist");
        Battle storage b = battles[_battleId];
        
        uint256[] memory agentHealths = new uint256[](b.agentIds.length);
        for (uint256 i = 0; i < b.agentIds.length; i++) {
            agentHealths[i] = battleAgentHealth[_battleId][b.agentIds[i]];
        }
        
        return BattleView({
            battleId: b.battleId,
            agentIds: b.agentIds,
            agentHealths: agentHealths,
            tactics: b.tactics,
            arena: b.arena,
            status: b.status,
            winner: b.winner
        });
    }

    function getBattleCount() public view returns (uint256) {
        return battles.length;
    }
}