
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("BirdSubscriptionModule", (m) => {

    // Deploy the BirdSubscription smart contract
    const birdSubscription = m.contract("BirdSubscription");

    return { birdSubscription };
});
