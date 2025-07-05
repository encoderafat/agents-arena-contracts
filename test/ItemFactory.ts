import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("ItemFactory", function () {
  let itemFactory: Contract;
  let owner: HardhatEthersSigner;
  let craftingContract: HardhatEthersSigner;
  let user1: HardhatEthersSigner;
  let user2: HardhatEthersSigner;

  beforeEach(async function () {
    [owner, craftingContract, user1, user2] = await ethers.getSigners();

    // Deploy ItemFactory
    const ItemFactoryFactory = await ethers.getContractFactory("ItemFactory");
    itemFactory = await ItemFactoryFactory.deploy(await owner.getAddress());
    await itemFactory.waitForDeployment();

    // Set crafting contract
    await itemFactory.setCraftingContract(await craftingContract.getAddress());
  });

  describe("Deployment", function () {
    it("Should set the correct owner", async function () {
      expect(await itemFactory.owner()).to.equal(await owner.getAddress());
    });

    it("Should initialize tokenIdCounter to 0", async function () {
      expect(await itemFactory.tokenIdCounter()).to.equal(0);
    });

    it("Should set correct name and symbol", async function () {
      expect(await itemFactory.name()).to.equal("ItemNFT");
      expect(await itemFactory.symbol()).to.equal("ITM");
    });

    it("Should have no crafting contract initially", async function () {
      const freshFactory = await (await ethers.getContractFactory("ItemFactory")).deploy(owner.address);
      expect(await freshFactory.craftingContract()).to.equal(ethers.ZeroAddress);
    });
  });

  describe("setCraftingContract", function () {
    it("Should allow owner to set crafting contract", async function () {
      const newCraftingContract = await user1.getAddress();
      await itemFactory.setCraftingContract(newCraftingContract);
      expect(await itemFactory.craftingContract()).to.equal(newCraftingContract);
    });

    it("Should revert if non-owner tries to set crafting contract", async function () {
      await expect(
        itemFactory.connect(user1).setCraftingContract(await user1.getAddress())
      ).to.be.revertedWithCustomError(itemFactory, "OwnableUnauthorizedAccount")
      .withArgs(await user1.getAddress());
    });
  });

  describe("mint", function () {
    it("Should mint item with correct properties", async function () {
      const itemType = 0; // Weapon
      const power = 100;
      
      await expect(itemFactory.connect(craftingContract).mint(user1.address, itemType, power))
        .to.emit(itemFactory, "ItemMinted")
        .withArgs(1, itemType, power);

      // Check ownership
      expect(await itemFactory.ownerOf(1)).to.equal(await user1.getAddress());
      expect(await itemFactory.balanceOf(await user1.getAddress())).to.equal(1);

      // Check item properties
      const item = await itemFactory.getItem(1);
      expect(item.id).to.equal(1);
      expect(item.itemType).to.equal(itemType);
      expect(item.power).to.equal(power);
    });

    it("Should increment tokenIdCounter after minting", async function () {
      await itemFactory.connect(craftingContract).mint(user1.address, 0, 50);
      expect(await itemFactory.tokenIdCounter()).to.equal(1);
      
      await itemFactory.connect(craftingContract).mint(user2.address, 1, 75);
      expect(await itemFactory.tokenIdCounter()).to.equal(2);
    });

    it("Should return correct token ID", async function () {
      const tokenId = await itemFactory.connect(craftingContract).mint.staticCall(user1.address, 0, 100);
      expect(tokenId).to.equal(1);
      
      await itemFactory.connect(craftingContract).mint(user1.address, 0, 100);
      const nextTokenId = await itemFactory.connect(craftingContract).mint.staticCall(user2.address, 1, 200);
      expect(nextTokenId).to.equal(2);
    });

    it("Should revert if non-crafting contract tries to mint", async function () {
      await expect(
        itemFactory.connect(user1).mint(user1.address, 0, 100)
      ).to.be.revertedWith("Only Crafting contract can mint");
    });

    it("Should mint different item types", async function () {
      // Mint weapon (type 0)
      await itemFactory.connect(craftingContract).mint(user1.address, 0, 100);
      // Mint armor (type 1)
      await itemFactory.connect(craftingContract).mint(user1.address, 1, 150);

      const weapon = await itemFactory.getItem(1);
      const armor = await itemFactory.getItem(2);

      expect(weapon.itemType).to.equal(0);
      expect(armor.itemType).to.equal(1);
      expect(weapon.power).to.equal(100);
      expect(armor.power).to.equal(150);
    });

    it("Should handle large power values", async function () {
      const largePower = ethers.parseUnits("999999999999999999", 0);
      await itemFactory.connect(craftingContract).mint(user1.address, 0, largePower);
      
      const item = await itemFactory.getItem(1);
      expect(item.power).to.equal(largePower);
    });
  });

  describe("getItem", function () {
    beforeEach(async function () {
      await itemFactory.connect(craftingContract).mint(user1.address, 0, 100);
    });

    it("Should return correct item data", async function () {
      const item = await itemFactory.getItem(1);
      expect(item.id).to.equal(1);
      expect(item.itemType).to.equal(0);
      expect(item.power).to.equal(100);
    });

    it("Should revert for non-existent item", async function () {
      await expect(itemFactory.getItem(999))
        .to.be.revertedWith("Item does not exist");
    });
  });

  describe("mintForTesting", function () {
    it("Should allow owner to mint for testing", async function () {
      const itemType = 1;
      const power = 200;
      
      await expect(itemFactory.mintForTesting(user1.address, itemType, power))
        .to.emit(itemFactory, "ItemMinted")
        .withArgs(1, itemType, power);

      expect(await itemFactory.ownerOf(1)).to.equal(user1.address);
      
      const item = await itemFactory.getItem(1);
      expect(item.id).to.equal(1);
      expect(item.itemType).to.equal(itemType);
      expect(item.power).to.equal(power);
    });

    it("Should revert if non-owner tries to mint for testing", async function () {
      await expect(
        itemFactory.connect(user1).mintForTesting(user1.address, 0, 100)
      ).to.be.revertedWithCustomError(itemFactory, "OwnableUnauthorizedAccount")
      .withArgs(await user1.getAddress());
    });

    it("Should increment tokenIdCounter", async function () {
      await itemFactory.mintForTesting(user1.address, 0, 100);
      expect(await itemFactory.tokenIdCounter()).to.equal(1);
    });
  });

  describe("exists", function () {
    it("Should return true for existing tokens", async function () {
      await itemFactory.connect(craftingContract).mint(user1.address, 0, 100);
      expect(await itemFactory.exists(1)).to.be.true;
    });

    it("Should return false for non-existing tokens", async function () {
      expect(await itemFactory.exists(1)).to.be.false;
      expect(await itemFactory.exists(999)).to.be.false;
    });

    it("Should test exists function with transferred tokens", async function () {
      await itemFactory.connect(craftingContract).mint(user1.address, 0, 100);
      expect(await itemFactory.exists(1)).to.be.true;
      
      // Transfer token to another user
      await itemFactory.connect(user1).transferFrom(user1.address, user2.address, 1);
      
      // Token still exists, just with different owner
      expect(await itemFactory.exists(1)).to.be.true;
      expect(await itemFactory.ownerOf(1)).to.equal(user2.address);
    });
  });

  describe("burn", function () {
    beforeEach(async function () {
      await itemFactory.connect(craftingContract).mint(user1.address, 0, 100);
    });

    it("Should allow owner to burn their token", async function () {
      expect(await itemFactory.exists(1)).to.be.true;
      
      await expect(itemFactory.connect(user1).burn(1))
        .to.emit(itemFactory, "ItemBurned")
        .withArgs(1);
      
      expect(await itemFactory.exists(1)).to.be.false;
      await expect(itemFactory.getItem(1))
        .to.be.revertedWith("Item does not exist");
    });

    it("Should allow approved user to burn token", async function () {
      await itemFactory.connect(user1).approve(user2.address, 1);
      
      await expect(itemFactory.connect(user2).burn(1))
        .to.emit(itemFactory, "ItemBurned")
        .withArgs(1);
      
      expect(await itemFactory.exists(1)).to.be.false;
    });

    it("Should revert if unauthorized user tries to burn", async function () {
      await expect(itemFactory.connect(user2).burn(1))
        .to.be.revertedWith("Caller is not owner nor approved");
    });

    it("Should revert when burning non-existent token", async function () {
      await expect(itemFactory.connect(user1).burn(999))
        .to.be.revertedWithCustomError(itemFactory, "ERC721NonexistentToken")
        .withArgs(999);
    });
  });

  describe("ERC721 Functionality", function () {
    beforeEach(async function () {
      await itemFactory.connect(craftingContract).mint(user1.address, 0, 100);
      await itemFactory.connect(craftingContract).mint(user1.address, 1, 200);
    });

    it("Should support ERC721 transfers", async function () {
      expect(await itemFactory.ownerOf(1)).to.equal(user1.address);
      
      await itemFactory.connect(user1).transferFrom(user1.address, user2.address, 1);
      
      expect(await itemFactory.ownerOf(1)).to.equal(user2.address);
      expect(await itemFactory.balanceOf(user1.address)).to.equal(1);
      expect(await itemFactory.balanceOf(user2.address)).to.equal(1);
    });

    it("Should support approvals", async function () {
      await itemFactory.connect(user1).approve(user2.address, 1);
      expect(await itemFactory.getApproved(1)).to.equal(user2.address);
      
      await itemFactory.connect(user2).transferFrom(user1.address, user2.address, 1);
      expect(await itemFactory.ownerOf(1)).to.equal(user2.address);
    });

    it("Should support setApprovalForAll", async function () {
      await itemFactory.connect(user1).setApprovalForAll(user2.address, true);
      expect(await itemFactory.isApprovedForAll(user1.address, user2.address)).to.be.true;
      
      await itemFactory.connect(user2).transferFrom(user1.address, user2.address, 1);
      await itemFactory.connect(user2).transferFrom(user1.address, user2.address, 2);
      
      expect(await itemFactory.balanceOf(user2.address)).to.equal(2);
      expect(await itemFactory.balanceOf(user1.address)).to.equal(0);
    });

    it("Should revert on unauthorized transfers", async function () {
      await expect(
        itemFactory.connect(user2).transferFrom(user1.address, user2.address, 1)
      ).to.be.revertedWithCustomError(itemFactory, "ERC721InsufficientApproval")
      .withArgs(await user2.getAddress(), 1);
    });
  });

  describe("Token URI", function () {
    it("Should handle tokenURI queries", async function () {
      await itemFactory.connect(craftingContract).mint(user1.address, 0, 100);
      
      // The base ERC721 implementation returns empty string for tokenURI
      const tokenURI = await itemFactory.tokenURI(1);
      expect(typeof tokenURI).to.equal("string");
    });

    it("Should revert tokenURI for non-existent token", async function () {
      await expect(itemFactory.tokenURI(999))
        .to.be.revertedWithCustomError(itemFactory, "ERC721NonexistentToken")
        .withArgs(999);
    });
  });

  describe("Integration with other contracts", function () {
    it("Should work with multiple crafting contracts", async function () {
      const newCraftingContract = user2.address;
      
      // First crafting contract mints
      await itemFactory.connect(craftingContract).mint(user1.address, 0, 100);
      
      // Change crafting contract
      await itemFactory.setCraftingContract(newCraftingContract);
      
      // New crafting contract mints
      await itemFactory.connect(user2).mint(user1.address, 1, 200);
      
      expect(await itemFactory.tokenIdCounter()).to.equal(2);
      expect(await itemFactory.balanceOf(user1.address)).to.equal(2);
    });

    it("Should maintain item data across ownership changes", async function () {
      await itemFactory.connect(craftingContract).mint(user1.address, 0, 100);
      
      const itemBefore = await itemFactory.getItem(1);
      
      // Transfer to another user
      await itemFactory.connect(user1).transferFrom(user1.address, user2.address, 1);
      
      const itemAfter = await itemFactory.getItem(1);
      
      // Item data should remain the same
      expect(itemAfter.id).to.equal(itemBefore.id);
      expect(itemAfter.itemType).to.equal(itemBefore.itemType);
      expect(itemAfter.power).to.equal(itemBefore.power);
    });
  });

  describe("Edge Cases", function () {
    it("Should handle zero power items", async function () {
      await itemFactory.connect(craftingContract).mint(user1.address, 0, 0);
      
      const item = await itemFactory.getItem(1);
      expect(item.power).to.equal(0);
    });

    it("Should handle maximum item type values", async function () {
      const maxItemType = 255; // uint8 max
      await itemFactory.connect(craftingContract).mint(user1.address, maxItemType, 100);
      
      const item = await itemFactory.getItem(1);
      expect(item.itemType).to.equal(maxItemType);
    });

    it("Should handle minting to EOA addresses", async function () {
      // Test minting to regular user addresses (EOA - Externally Owned Accounts)
      // Contract addresses require ERC721Receiver implementation in OpenZeppelin v5
      await itemFactory.connect(craftingContract).mint(user1.address, 0, 100);
      
      expect(await itemFactory.ownerOf(1)).to.equal(user1.address);
      expect(await itemFactory.balanceOf(user1.address)).to.equal(1);
    });
  });

  describe("Event Emission", function () {
    it("Should emit ItemMinted event with correct parameters", async function () {
      const itemType = 1;
      const power = 150;
      
      await expect(itemFactory.connect(craftingContract).mint(user1.address, itemType, power))
        .to.emit(itemFactory, "ItemMinted")
        .withArgs(1, itemType, power);
    });

    it("Should emit Transfer event on mint", async function () {
      await expect(itemFactory.connect(craftingContract).mint(user1.address, 0, 100))
        .to.emit(itemFactory, "Transfer")
        .withArgs(ethers.ZeroAddress, user1.address, 1);
    });

    it("Should emit multiple events correctly", async function () {
      const tx = await itemFactory.connect(craftingContract).mint(user1.address, 0, 100);
      const receipt = await tx.wait();
      
      // Should have both Transfer and ItemMinted events
      expect(receipt!.logs.length).to.be.gte(2);
    });
  });
});