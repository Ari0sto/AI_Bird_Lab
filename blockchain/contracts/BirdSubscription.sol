
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract BirdSubscription {

    uint256 public constant SUBSCRIPTION_PRICE = 0.001 ether;
    uint256 public constant SUBSCRIPTION_DURATION = 30 days;

    address public immutable owner;

    mapping(address => uint256) public subscriptionEnd;

    event SubscriptionPurchased(
        address indexed subscriber,
        uint256 expirationDate
    );

    event FundsWithdrawn(
        address indexed recipient,
        uint256 amount
    );

    // Set the contract owner
    constructor() {
        owner = msg.sender;
    }

    // Purchase or renew a subscription
    function subscribe() external payable {
        require(
            msg.value == SUBSCRIPTION_PRICE,
            "Incorrect payment amount"
        );

        uint256 startDate = block.timestamp;

        if (subscriptionEnd[msg.sender] > startDate) {
            startDate = subscriptionEnd[msg.sender];
        }

        uint256 expirationDate = startDate + SUBSCRIPTION_DURATION;

        subscriptionEnd[msg.sender] = expirationDate;

        emit SubscriptionPurchased(msg.sender, expirationDate);
    }

    // Check whether a user has an active subscription
    function isSubscribed(address user) external view returns (bool) {
        return subscriptionEnd[user] > block.timestamp;
    }

    // Withdraw collected funds (owner only)
    function withdraw() external {
        require(msg.sender == owner, "Only owner can withdraw");

        uint256 balance = address(this).balance;
        require(balance > 0, "No funds to withdraw");

        (bool success, ) = payable(owner).call{value: balance}("");
        require(success, "Withdrawal failed");

        emit FundsWithdrawn(owner, balance);
    }
}
