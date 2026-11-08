
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import hre from "hardhat";
import { parseEther } from "viem";

// Local blockchain for testing
const { viem, networkHelpers } = await hre.network.create();

const PRICE = parseEther("0.001");
const DURATION = 30n * 24n * 60n * 60n;

describe("BirdSubscription", function () {

    // Test 1: Purchase a subscription
    it("Should activate subscription after payment", async function () {

        const contract = await viem.deployContract("BirdSubscription");
        const [user] = await viem.getWalletClients();

        await contract.write.subscribe({
            value: PRICE
        });

        const active = await contract.read.isSubscribed([
            user.account.address
        ]);

        assert.equal(active, true);
    });

    // Test 2: Reject an incorrect payment
    it("Should reject incorrect payment", async function () {

        const contract = await viem.deployContract("BirdSubscription");

        await viem.assertions.revertWith(
            contract.write.subscribe({
                value: parseEther("0.0005")
            }),
            "Incorrect payment amount"
        );
    });

    // Test 3: Different users have different subscriptions
    it("Should track subscriptions separately", async function () {

        const contract = await viem.deployContract("BirdSubscription");
        const [user1, user2] = await viem.getWalletClients();

        await contract.write.subscribe({
            account: user1.account,
            value: PRICE
        });

        const active1 = await contract.read.isSubscribed([
            user1.account.address
        ]);

        const active2 = await contract.read.isSubscribed([
            user2.account.address
        ]);

        assert.equal(active1, true);
        assert.equal(active2, false);
    });

    // Test 4: Renew an existing subscription
    it("Should extend subscription on renewal", async function () {

        const contract = await viem.deployContract("BirdSubscription");
        const [user] = await viem.getWalletClients();

        await contract.write.subscribe({
            value: PRICE
        });

        const firstEnd = await contract.read.subscriptionEnd([
            user.account.address
        ]);

        await contract.write.subscribe({
            value: PRICE
        });

        const secondEnd = await contract.read.subscriptionEnd([
            user.account.address
        ]);

        assert.equal(secondEnd, firstEnd + DURATION);
    });

    // Test 5: Subscription expires after 30 days
    it("Should expire after 30 days", async function () {

        const contract = await viem.deployContract("BirdSubscription");
        const [user] = await viem.getWalletClients();

        await contract.write.subscribe({
            value: PRICE
        });

        const expiration = await contract.read.subscriptionEnd([
            user.account.address
        ]);

        await networkHelpers.time.increaseTo(
            Number(expiration) + 1
        );

        const active = await contract.read.isSubscribed([
            user.account.address
        ]);

        assert.equal(active, false);
    });

    
    // Test 6: Check contract owner
    it("Should set the correct owner", async function () {

        const contract = await viem.deployContract("BirdSubscription");
        const [owner] = await viem.getWalletClients();

        const contractOwner = await contract.read.owner();

        assert.equal(
            contractOwner.toLowerCase(),
            owner.account.address.toLowerCase()
        );
    });

    // Test 7: Owner can withdraw funds
    it("Should allow owner to withdraw funds", async function () {

        const contract = await viem.deployContract("BirdSubscription");

        // Purchase a subscription
        await contract.write.subscribe({
            value: PRICE
        });

        const publicClient = await viem.getPublicClient();

        // Check contract balance before withdrawal
        const balanceBefore = await publicClient.getBalance({
            address: contract.address
        });

        assert.equal(balanceBefore, PRICE);

        // Withdraw funds
        await contract.write.withdraw();

        // Check contract balance after withdrawal
        const balanceAfter = await publicClient.getBalance({
            address: contract.address
        });

        assert.equal(balanceAfter, 0n);
    });

    // Test 8: Other users cannot withdraw funds
    it("Should reject withdrawal by non-owner", async function () {

        const contract = await viem.deployContract("BirdSubscription");
        const [, otherUser] = await viem.getWalletClients();

        // Purchase a subscription
        await contract.write.subscribe({
            value: PRICE
        });

        // Attempt withdrawal from another account
        await viem.assertions.revertWith(
            contract.write.withdraw({
                account: otherUser.account
            }),
            "Only owner can withdraw"
        );
    });

});
