import assert from "node:assert/strict";
import { describe, it } from "node:test";
import hre from "hardhat";
import { parseEther } from "viem";

const { viem, networkHelpers } = await hre.network.create();
const PRICE = parseEther("0.001");
const DURATION = 30n * 24n * 60n * 60n;

describe("BirdSubscription: extra security and boundary checks", () => {
  it("exposes the advertised price and duration", async () => {
    const contract = await viem.deployContract("BirdSubscription");
    assert.equal(await contract.read.SUBSCRIPTION_PRICE(), PRICE);
    assert.equal(await contract.read.SUBSCRIPTION_DURATION(), DURATION);
  });

  it("starts with no subscription for a wallet", async () => {
    const contract = await viem.deployContract("BirdSubscription");
    const [user] = await viem.getWalletClients();
    assert.equal(await contract.read.subscriptionEnd([user.account.address]), 0n);
    assert.equal(await contract.read.isSubscribed([user.account.address]), false);
  });

  it("rejects a zero payment", async () => {
    const contract = await viem.deployContract("BirdSubscription");
    await viem.assertions.revertWith(contract.write.subscribe({ value: 0n }), "Incorrect payment amount");
  });

  it("rejects an overpayment", async () => {
    const contract = await viem.deployContract("BirdSubscription");
    await viem.assertions.revertWith(contract.write.subscribe({ value: PRICE * 2n }), "Incorrect payment amount");
  });

  it("does not modify expiry on a rejected payment", async () => {
    const contract = await viem.deployContract("BirdSubscription");
    const [user] = await viem.getWalletClients();
    await contract.write.subscribe({ value: PRICE });
    const oldEnd = await contract.read.subscriptionEnd([user.account.address]);
    await viem.assertions.revertWith(contract.write.subscribe({ value: 0n }), "Incorrect payment amount");
    assert.equal(await contract.read.subscriptionEnd([user.account.address]), oldEnd);
  });

  it("stops subscription exactly at expiration timestamp", async () => {
    const contract = await viem.deployContract("BirdSubscription");
    const [user] = await viem.getWalletClients();
    await contract.write.subscribe({ value: PRICE });
    const end = await contract.read.subscriptionEnd([user.account.address]);
    await networkHelpers.time.increaseTo(Number(end));
    assert.equal(await contract.read.isSubscribed([user.account.address]), false);
  });

  it("starts a fresh 30-day period if renewal happens after expiration", async () => {
    const contract = await viem.deployContract("BirdSubscription");
    const [user] = await viem.getWalletClients();
    await contract.write.subscribe({ value: PRICE });
    const firstEnd = await contract.read.subscriptionEnd([user.account.address]);
    await networkHelpers.time.increaseTo(Number(firstEnd) + 60);
    await contract.write.subscribe({ value: PRICE });
    const secondEnd = await contract.read.subscriptionEnd([user.account.address]);
    const blockTime = BigInt(await networkHelpers.time.latest());
    assert.equal(secondEnd, blockTime + DURATION);
  });

  it("cannot withdraw an empty contract balance", async () => {
    const contract = await viem.deployContract("BirdSubscription");
    await viem.assertions.revertWith(contract.write.withdraw(), "No funds to withdraw");
  });

  it("withdrawal collects the sum of several subscriptions", async () => {
    const contract = await viem.deployContract("BirdSubscription");
    const [first, second] = await viem.getWalletClients();
    await contract.write.subscribe({ account: first.account, value: PRICE });
    await contract.write.subscribe({ account: second.account, value: PRICE });
    const publicClient = await viem.getPublicClient();
    assert.equal(await publicClient.getBalance({ address: contract.address }), PRICE * 2n);
    await contract.write.withdraw();
    assert.equal(await publicClient.getBalance({ address: contract.address }), 0n);
    assert.equal(await contract.read.isSubscribed([first.account.address]), true);
    assert.equal(await contract.read.isSubscribed([second.account.address]), true);
  });
});
