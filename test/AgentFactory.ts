import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("AgentFactory", function () {
    let agentFactory: Contract;
    let arena: Contract;
    let mockCadenceArch: Contract;
    let owner: HardhatEthersSigner;
    let user1: HardhatEthersSigner;
    let user2: HardhatEthersSigner;
    let arenaSigner: HardhatEthersSigner;

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

        // 4. Create arenaSigner for contract-to-contract calls
        await ethers.provider.send("hardhat_setBalance", [
          arenaAddress,
          "0x" + ethers.parseEther("1.0").toString(16)
        ]);
        await ethers.provider.send("hardhat_impersonateAccount", [arenaAddress]);
        arenaSigner = await ethers.getSigner(arenaAddress);

        // 5. Set Arena contract in AgentFactory
        await agentFactory.setArenaContract(arenaAddress);
});

    describe("Deployment", function () {
        it("Should set the right owner", async function () {
            expect(await agentFactory.owner()).to.equal(await owner.getAddress());
        });

        it("Should initialize tokenIdCounter to 0", async function () {
            // Use Number() to convert BigInt to number for comparison
            expect(Number(await agentFactory.tokenIdCounter())).to.equal(0);
        });

        it("Should pre-calculate XP requirements for levels 1-19", async function () {
            // Level 1 requires 1^3 * 100 = 100 XP
            expect(Number(await agentFactory.xpToLevelUp(1))).to.equal(100);
            // Level 2 requires 2^3 * 100 = 800 XP
            expect(Number(await agentFactory.xpToLevelUp(2))).to.equal(800);
            // Level 3 requires 3^3 * 100 = 2700 XP
            expect(Number(await agentFactory.xpToLevelUp(3))).to.equal(2700);
        });

        it("Should set the correct CadenceArch address", async function () {
            expect(await agentFactory.cadenceArch()).to.equal(await mockCadenceArch.getAddress());
        });
    });

    describe("setArenaContract", function () {
        it("Should allow owner to set arena contract", async function () {
            const newArenaAddress = await user1.getAddress();
            await agentFactory.setArenaContract(newArenaAddress);
            expect(await agentFactory.arenaContract()).to.equal(newArenaAddress);
        });

        it("Should revert if non-owner tries to set arena contract", async function () {
            await expect(
                agentFactory.connect(user1).setArenaContract(await user1.getAddress())
            ).to.be.revertedWith("Not the owner");
        });
    });

    describe("setCadenceArch", function () {
        it("Should allow owner to set CadenceArch address", async function () {
            const newAddress = await user1.getAddress();
            await agentFactory.setCadenceArch(newAddress);
            expect(await agentFactory.cadenceArch()).to.equal(newAddress);
        });

        it("Should revert if non-owner tries to set CadenceArch address", async function () {
            await expect(
                agentFactory.connect(user1).setCadenceArch(await user1.getAddress())
            ).to.be.revertedWith("Not the owner");
        });
    });

    describe("mintAgent", function () {
        it("Should mint an agent with correct properties", async function () {
            const metadataCID = "QmTestCID123";

            // Test the transaction and event emission
            const tx = await agentFactory.connect(user1).mintAgent(metadataCID);
            await expect(tx)
                .to.emit(agentFactory, "AgentMinted");

            const agent = await agentFactory.getAgent(1);
            expect(Number(agent.id)).to.equal(1);
            expect(Number(agent.level)).to.equal(1);
            expect(Number(agent.experience)).to.equal(0);
            expect(agent.metadataCID).to.equal(metadataCID);
            expect(Number(agent.equippedItem)).to.equal(0);

            // DNA stats should be between 25-74
            expect(Number(agent.dna.strength)).to.be.gte(25).and.lte(74);
            expect(Number(agent.dna.agility)).to.be.gte(25).and.lte(74);
            expect(Number(agent.dna.intelligence)).to.be.gte(25).and.lte(74);
            expect(Number(agent.dna.elementalAffinity)).to.be.gte(0).and.lte(4);
        });

        it("Should increment tokenIdCounter after minting", async function () {
            await agentFactory.connect(user1).mintAgent("CID1");
            expect(Number(await agentFactory.tokenIdCounter())).to.equal(1);

            await agentFactory.connect(user2).mintAgent("CID2");
            expect(Number(await agentFactory.tokenIdCounter())).to.equal(2);
        });

        it("Should create agents with different DNA", async function () {
            // Set different random values to ensure different DNA
            await mockCadenceArch.setFixedRandomValue(12345);
            await agentFactory.connect(user1).mintAgent("CID1");
            
            await mockCadenceArch.setFixedRandomValue(54321);
            await agentFactory.connect(user1).mintAgent("CID2");

            const agent1 = await agentFactory.getAgent(1);
            const agent2 = await agentFactory.getAgent(2);

            // Convert BigInt values to numbers for comparison
            const agent1Stats = [
                Number(agent1.dna.strength),
                Number(agent1.dna.agility),
                Number(agent1.dna.intelligence),
                Number(agent1.dna.elementalAffinity)
            ];
            const agent2Stats = [
                Number(agent2.dna.strength),
                Number(agent2.dna.agility),
                Number(agent2.dna.intelligence),
                Number(agent2.dna.elementalAffinity)
            ];

            expect(agent1Stats).to.not.deep.equal(agent2Stats);
        });
    });

    describe("levelUp", function () {
        beforeEach(async function () {
            await agentFactory.connect(user1).mintAgent("TestCID");
            // Use arenaSigner instead of arena contract
            await agentFactory.connect(arenaSigner).gainExperience(1, 100);
        });

        it("Should level up agent when they have enough experience", async function () {
            const agentBefore = await agentFactory.getAgent(1);

            const tx = await agentFactory.levelUp(1);
            await expect(tx)
                .to.emit(agentFactory, "LeveledUp");

            const agentAfter = await agentFactory.getAgent(1);
            expect(Number(agentAfter.level)).to.equal(Number(agentBefore.level) + 1);

            // Stats should increase by 2 or 4 each
            expect(Number(agentAfter.dna.strength)).to.be.gte(Number(agentBefore.dna.strength) + 2);
            expect(Number(agentAfter.dna.strength)).to.be.lte(Number(agentBefore.dna.strength) + 4);
            expect(Number(agentAfter.dna.agility)).to.be.gte(Number(agentBefore.dna.agility) + 2);
            expect(Number(agentAfter.dna.agility)).to.be.lte(Number(agentBefore.dna.agility) + 4);
            expect(Number(agentAfter.dna.intelligence)).to.be.gte(Number(agentBefore.dna.intelligence) + 2);
            expect(Number(agentAfter.dna.intelligence)).to.be.lte(Number(agentBefore.dna.intelligence) + 4);
        });

        it("Should revert if agent doesn't exist", async function () {
            await expect(agentFactory.levelUp(999))
                .to.be.revertedWith("Agent does not exist");
        });

        it("Should revert if agent doesn't have enough experience", async function () {
            await agentFactory.connect(user1).mintAgent("TestCID2");
            await expect(agentFactory.levelUp(2))
                .to.be.revertedWith("Not enough experience");
        });
    });

    describe("gainExperience", function () {
        beforeEach(async function () {
            await agentFactory.connect(user1).mintAgent("TestCID");
        });

        it("Should allow arena contract to give experience", async function () {
            const tx = await agentFactory.connect(arenaSigner).gainExperience(1, 50);
            await expect(tx)
                .to.emit(agentFactory, "ExperienceGained");

            const agent = await agentFactory.getAgent(1);
            expect(Number(agent.experience)).to.equal(50);
        });

        it("Should revert if non-arena contract tries to give experience", async function () {
            await expect(agentFactory.connect(user1).gainExperience(1, 50))
                .to.be.revertedWith("Only Arena can call this");
        });

        it("Should revert if agent doesn't exist", async function () {
            await expect(agentFactory.connect(arenaSigner).gainExperience(999, 50))
                .to.be.revertedWith("Agent does not exist");
        });

        it("Should accumulate experience correctly", async function () {
            await agentFactory.connect(arenaSigner).gainExperience(1, 30);
            await agentFactory.connect(arenaSigner).gainExperience(1, 20);

            const agent = await agentFactory.getAgent(1);
            expect(Number(agent.experience)).to.equal(50);
        });
    });

    describe("equipItem", function () {
        beforeEach(async function () {
            await agentFactory.connect(user1).mintAgent("TestCID");
        });

        it("Should allow equipping an item to an agent", async function () {
            const itemId = 123;

            const tx = await agentFactory.equipItem(1, itemId);
            await expect(tx)
                .to.emit(agentFactory, "ItemEquipped");

            const agent = await agentFactory.getAgent(1);
            expect(Number(agent.equippedItem)).to.equal(itemId);
        });

        it("Should allow changing equipped item", async function () {
            await agentFactory.equipItem(1, 123);
            await agentFactory.equipItem(1, 456);

            const agent = await agentFactory.getAgent(1);
            expect(Number(agent.equippedItem)).to.equal(456);
        });
    });

    describe("getAgent", function () {
        it("Should return correct agent data", async function () {
            const metadataCID = "TestCID";
            await agentFactory.connect(user1).mintAgent(metadataCID);

            const agent = await agentFactory.getAgent(1);
            expect(Number(agent.id)).to.equal(1);
            expect(Number(agent.level)).to.equal(1);
            expect(Number(agent.experience)).to.equal(0);
            expect(agent.metadataCID).to.equal(metadataCID);
            expect(Number(agent.equippedItem)).to.equal(0);
        });

        it("Should return empty agent for non-existent ID", async function () {
            const agent = await agentFactory.getAgent(999);
            expect(Number(agent.id)).to.equal(0);
        });
    });
});