// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ItemFactory is ERC721, Ownable {
    struct Item {
        uint256 id;
        uint8 itemType; // 0:Weapon, 1:Armor
        uint256 power;  // Bonus to strength or intelligence
    }

    mapping(uint256 => Item) public items;
    uint256 public tokenIdCounter;
    address public craftingContract;

    event ItemMinted(uint256 indexed tokenId, uint8 itemType, uint256 power);
    event ItemBurned(uint256 indexed tokenId);

    modifier onlyCraftingContract() {
        require(msg.sender == craftingContract, "Only Crafting contract can mint");
        _;
    }

    constructor(address initialOwner) ERC721("ItemNFT", "ITM") Ownable(initialOwner) {
        tokenIdCounter = 0;
    }

    function setCraftingContract(address _craftingAddress) public onlyOwner {
        craftingContract = _craftingAddress;
    }

    function mint(address to, uint8 _itemType, uint256 _power) public onlyCraftingContract returns (uint256) {
        tokenIdCounter++;
        uint256 newItemId = tokenIdCounter;

        // Mint the NFT to the recipient
        _safeMint(to, newItemId);

        // Store the item's custom metadata
        items[newItemId] = Item({
            id: newItemId,
            itemType: _itemType,
            power: _power
        });

        emit ItemMinted(newItemId, _itemType, _power);
        return newItemId;
    }

    function burn(uint256 tokenId) public {
        // Check if token exists using the public exists() function
        if (!exists(tokenId)) {
            revert ERC721NonexistentToken(tokenId);
        }
        
        require(_isAuthorized(_ownerOf(tokenId), msg.sender, tokenId), "Caller is not owner nor approved");
        
        // Delete the item data
        delete items[tokenId];
        
        // Burn the token
        _burn(tokenId);
        
        emit ItemBurned(tokenId);
    }

    function getItem(uint256 _tokenId) public view returns (Item memory) {
        require(_ownerOf(_tokenId) != address(0), "Item does not exist");
        return items[_tokenId];
    }

    // Additional helper functions for testing and usability
    function mintForTesting(address to, uint8 _itemType, uint256 _power) public onlyOwner returns (uint256) {
        tokenIdCounter++;
        uint256 newItemId = tokenIdCounter;

        _safeMint(to, newItemId);

        items[newItemId] = Item({
            id: newItemId,
            itemType: _itemType,
            power: _power
        });

        emit ItemMinted(newItemId, _itemType, _power);
        return newItemId;
    }

    function exists(uint256 tokenId) public view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }
}