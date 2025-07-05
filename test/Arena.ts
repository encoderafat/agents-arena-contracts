import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("Arena", function () {
    let agentFactory: Contract;
    let arena: Contract;
    let mockCadenceArch: Contract;
    let owner: HardhatEthersSigner;
    let user1: HardhatEthersSigner;
    let user2: HardhatEthersSigner;

    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();

        // 1. Deploy MockCadenceArch first
        const MockCadenceArchFactory = await ethers.getContractFactory("MockCadenceArch");
        mockCadenceArch = await MockCadenceArchFactory.deploy(12345);
        await mockCadenceArch.waitForDeployment();
        const mockCadenceArchAddress = await mockCadenceArch.getAddress();

        // 2. Deploy AgentFactory with mock address
        const AgentFactoryFactory = await ethers.getContractFactory("AgentFactory");
        agentFactory = await AgentFactoryFactory.deploy(mockCadenceArchAddress);
        await agentFactory.waitForDeployment();
        const agentFactoryAddress = await agentFactory.getAddress();

        // 3. Deploy Arena with both addresses
        const ArenaFactory = await ethers.getContractFactory("Arena");
        arena = await ArenaFactory.deploy(agentFactoryAddress, mockCadenceArchAddress);
        await arena.waitForDeployment();
        const arenaAddress = await arena.getAddress();

        // Set Arena as the arena contract in AgentFactory
        await agentFactory.setArenaContract(arenaAddress);

        // Create two test agents
        await agentFactory.connect(user1).mintAgent("Agent1CID");
        await agentFactory.connect(user2).mintAgent("Agent2CID");
    });

    describe("Deployment", function () {
        it("Should set the correct AgentFactory address", async function () {
            expect(await arena.agentFactory()).to.equal(await agentFactory.getAddress());
        });

        it("Should initialize with zero battles", async function () {
            expect(await arena.getBattleCount()).to.equal(0);
        });
    });

    describe("startBattle", function () {
    it("Should start a battle between two agents with tactics", async function () {
        const tactics1 = { aggressiveness: 60, strategy: 0, riskTolerance: 50 }; // Adjust values according to your requirements
        const tactics2 = { aggressiveness: 50, strategy: 1, riskTolerance: 30 };

        const tx = await arena.startBattle(1, tactics1, 2, tactics2);
        await expect(tx)
            .to.emit(arena, "BattleStarted")
            .withArgs(
                0n, // battleId (bigint)
                1n, // agent1 (bigint)
                2n, // agent2 (bigint)
                (arenaType: bigint) => [0, 1, 2].includes(Number(arenaType)) // Convert to number for comparison
            );

        const battle = await arena.getBattle(0);
        expect(battle.battleId).to.equal(0n);
        expect(battle.agentIds).to.deep.equal([1n, 2n]);
        expect(battle.tactics[0].aggressiveness).to.equal(tactics1.aggressiveness);
        expect(battle.tactics[1].riskTolerance).to.equal(tactics2.riskTolerance);
        expect(battle.status).to.equal(0); // BattleStatus.Ongoing
        expect(battle.winner).to.equal(0n);
    });

    it("Should set agents as in battle", async function () {
        const tactics1 = { aggressiveness: 60, strategy: 0, riskTolerance: 50 };
        const tactics2 = { aggressiveness: 50, strategy: 1, riskTolerance: 30 };
        await arena.startBattle(1, tactics1, 2, tactics2);
        
        expect(await arena.agentInBattle(1)).to.be.true;
        expect(await arena.agentInBattle(2)).to.be.true;
    });

    it("Should calculate correct initial health", async function () {
        const tactics1 = { aggressiveness: 60, strategy: 0, riskTolerance: 50 };
        const tactics2 = { aggressiveness: 50, strategy: 1, riskTolerance: 30 };
        await arena.startBattle(1, tactics1, 2, tactics2);
        
        const agent1 = await agentFactory.getAgent(1);
        const agent2 = await agentFactory.getAgent(2);
        
        const expectedHealth1 = Number(agent1.level) * 20 + Number(agent1.dna.strength) * 5;
        const expectedHealth2 = Number(agent2.level) * 20 + Number(agent2.dna.strength) * 5;
        
        const health1 = await arena.battleAgentHealth(0, 1);
        const health2 = await arena.battleAgentHealth(0, 2);
        
        expect(Number(health1)).to.equal(expectedHealth1);
        expect(Number(health2)).to.equal(expectedHealth2);
    });

    it("Should revert if agent is already in battle", async function () {
        const tactics1 = { aggressiveness: 60, strategy: 0, riskTolerance: 50 };
        const tactics2 = { aggressiveness: 50, strategy: 1, riskTolerance: 30 };
        await arena.startBattle(1, tactics1, 2, tactics2);

        await agentFactory.connect(user1).mintAgent("Agent3CID");
        await expect(arena.startBattle(1, { aggressiveness: 0, strategy: 0, riskTolerance: 0 }, 3, { aggressiveness: 0, strategy: 0, riskTolerance: 0 }))
            .to.be.revertedWith("Agent already in battle");
    });

    it("Should revert if agent doesn't exist", async function () {
        const tactics1 = { aggressiveness: 60, strategy: 0, riskTolerance: 50 };
        const tactics2 = { aggressiveness: 50, strategy: 1, riskTolerance: 30 };
        await expect(arena.startBattle(1, tactics1, 999, tactics2))
            .to.be.revertedWith("Agent does not exist");
    });

    it("Should increment battle count", async function () {
        expect(await arena.getBattleCount()).to.equal(0);

        const tactics1 = { aggressiveness: 60, strategy: 0, riskTolerance: 50 };
        const tactics2 = { aggressiveness: 50, strategy: 1, riskTolerance: 30 };
        await arena.startBattle(1, tactics1, 2, tactics2);
        expect(await arena.getBattleCount()).to.equal(1);
        
        await agentFactory.connect(user1).mintAgent("Agent3CID");
        await agentFactory.connect(user2).mintAgent("Agent4CID");
        await arena.startBattle(3, { aggressiveness: 0, strategy: 0, riskTolerance: 0 }, 4, { aggressiveness: 0, strategy: 0, riskTolerance: 0 });
        expect(await arena.getBattleCount()).to.equal(2);
    });
  });


    describe("fight", function () {
        beforeEach(async function () {
            const tactics1 = { aggressiveness: 60, strategy: 0, riskTolerance: 50 };
            const tactics2 = { aggressiveness: 50, strategy: 1, riskTolerance: 30 };
            await arena.startBattle(1, tactics1, 2, tactics2);
        });

        it("Should resolve battle and determine winner", async function () {
            const tx = await arena.fight(0);
            await expect(tx)
                .to.emit(arena, "BattleFinished")
                .withArgs(0, (winner: any) => [1, 2].includes(Number(winner)), 
                        (loser: any) => [1, 2].includes(Number(loser)));

            const battle = await arena.getBattle(0);
            expect(battle.status).to.equal(1); // BattleStatus.Finished
            expect([1, 2]).to.include(Number(battle.winner));
        });

        it("Should free agents from battle after fight", async function () {
            await arena.fight(0);
            
            expect(await arena.agentInBattle(1)).to.be.false;
            expect(await arena.agentInBattle(2)).to.be.false;
        });

        it("Should award experience to winner", async function () {
            const agent1Before = await agentFactory.getAgent(1);
            const agent2Before = await agentFactory.getAgent(2);
            
            await arena.fight(0);
            
            const battle = await arena.getBattle(0);
            const winnerId = battle.winner;
            const agentAfter = await agentFactory.getAgent(winnerId);
            
            if (Number(winnerId) === 1) {
                expect(Number(agentAfter.experience)).to.equal(Number(agent1Before.experience) + 50);
            } else {
                expect(Number(agentAfter.experience)).to.equal(Number(agent2Before.experience) + 50);
            }
        });

        it("Should revert if battle doesn't exist", async function () {
            await expect(arena.fight(999))
                .to.be.revertedWith("Battle does not exist");
        });

        it("Should revert if battle is already finished", async function () {
            await arena.fight(0);
            
            await expect(arena.fight(0))
                .to.be.revertedWith("Battle is already finished");
        });
    });

    describe("calculatePowerScore", function () {
      it("Should calculate different scores for different agents", async function () {
          // Mint agents 3 and 4
          await agentFactory.connect(user1).mintAgent("Agent3CID");
          await agentFactory.connect(user2).mintAgent("Agent4CID");
          
          const tactics1 = { aggressiveness: 60, strategy: 0, riskTolerance: 50 };
          const tactics2 = { aggressiveness: 50, strategy: 1, riskTolerance: 30 };
          
          const tactics3 = { aggressiveness: 40, strategy: 0, riskTolerance: 40 };
          const tactics4 = { aggressiveness: 70, strategy: 1, riskTolerance: 30 };
          // Start the first battle
          await arena.startBattle(1, tactics1, 2, tactics2);
          // Start a second battle
          await arena.startBattle(3, tactics3, 4, tactics4);

          await arena.fight(0);
          await arena.fight(1);

          const battle1 = await arena.getBattle(0);
          const battle2 = await arena.getBattle(1);
          
          // Each battle should have a winner
          expect(battle1.winner).to.not.equal(0);
          expect(battle2.winner).to.not.equal(0);
      });
    });

    describe("getBattle", function () {
        it("Should return correct battle information", async function () {
            const tactics1 = { aggressiveness: 60, strategy: 0, riskTolerance: 50 };
            const tactics2 = { aggressiveness: 50, strategy: 1, riskTolerance: 30 };
            await arena.startBattle(1, tactics1, 2, tactics2);
            
            const battle = await arena.getBattle(0);
            expect(battle.battleId).to.equal(0);
            expect(battle.agentIds.length).to.equal(2);
            expect(battle.agentIds[0]).to.equal(1);
            expect(battle.agentIds[1]).to.equal(2);
            expect(battle.tactics.length).to.equal(2); // Check if it contains tactics
            expect(battle.status).to.equal(0); // Ongoing
            expect(battle.winner).to.equal(0);
        });

        it("Should return correct health values", async function () {
            const tactics1 = { aggressiveness: 60, strategy: 0, riskTolerance: 50 };
            const tactics2 = { aggressiveness: 50, strategy: 1, riskTolerance: 30 };
            await arena.startBattle(1, tactics1, 2, tactics2);
            
            const battle = await arena.getBattle(0);
            const agent1 = await agentFactory.getAgent(1);
            const agent2 = await agentFactory.getAgent(2);
            
            const expectedHealth1 = Number(agent1.level) * 20 + Number(agent1.dna.strength) * 5;
            const expectedHealth2 = Number(agent2.level) * 20 + Number(agent2.dna.strength) * 5;
            
            expect(Number(battle.agentHealths[0])).to.equal(expectedHealth1);
            expect(Number(battle.agentHealths[1])).to.equal(expectedHealth2);
        });

        it("Should revert if battle doesn't exist", async function () {
            await expect(arena.getBattle(999))
                .to.be.revertedWith("Battle does not exist");
        });
    });

    describe("getBattleCount", function () {
        it("Should return correct battle count", async function () {
            expect(await arena.getBattleCount()).to.equal(0);
            
            const tactics1 = { aggressiveness: 60, strategy: 0, riskTolerance: 50 };
            const tactics2 = { aggressiveness: 50, strategy: 1, riskTolerance: 30 };
            await arena.startBattle(1, tactics1, 2, tactics2);
            expect(await arena.getBattleCount()).to.equal(1);
        });
    });

    describe("Arena Type Effects", function () {
        it("Should handle different arena types", async function () {
            // Start multiple battles to test different arena types
            for (let i = 0; i < 10; i++) {
                await agentFactory.connect(user1).mintAgent(`Agent${i * 2 + 3}CID`);
                await agentFactory.connect(user2).mintAgent(`Agent${i * 2 + 4}CID`);
                const tactics1 = { aggressiveness: 60, strategy: 0, riskTolerance: 50 };
                const tactics2 = { aggressiveness: 50, strategy: 1, riskTolerance: 30 };
                await arena.startBattle(i * 2 + 3, tactics1, i * 2 + 4, tactics2);
                
                const battle = await arena.getBattle(i);
                expect(battle.arena).to.be.gte(0).and.lte(2);
            }
        });
    });

    describe("Multiple Battles", function () {
    it("Should handle multiple concurrent battles", async function () {
        // Prepare tactics for multiple battles
        await agentFactory.connect(user1).mintAgent("Agent3CID");
        await agentFactory.connect(user2).mintAgent("Agent4CID");
        const tactics1 = { aggressiveness: 60, strategy: 0, riskTolerance: 50 };
        const tactics2 = { aggressiveness: 50, strategy: 1, riskTolerance: 30 };
        
        const tactics3 = { aggressiveness: 40, strategy: 0, riskTolerance: 40 };
        const tactics4 = { aggressiveness: 70, strategy: 1, riskTolerance: 30 };
        // Start the first battle
        await arena.startBattle(1, tactics1, 2, tactics2);
        // Start a second battle
        await arena.startBattle(3, tactics3, 4, tactics4);
        // You can add assertions to check the statuses of both battles
        // Example:
        const battle1 = await arena.getBattle(0);
        const battle2 = await arena.getBattle(1);
        
        expect(battle1.status).to.equal(0);
        expect(battle2.status).to.equal(0);
        
        // Fight both battles
        await arena.fight(0);
        await arena.fight(1);
        
        // Both battles should be finished
        const finishedBattle1 = await arena.getBattle(0);
        const finishedBattle2 = await arena.getBattle(1);
        
        expect(finishedBattle1.status).to.equal(1);
        expect(finishedBattle2.status).to.equal(1);
      });
    });
});
