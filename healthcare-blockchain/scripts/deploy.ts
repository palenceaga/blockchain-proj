import { network } from "hardhat";

const { ethers, networkName } = await network.create();

console.log(`Deploying HealthRecords to ${networkName}...`);

const healthRecords = await ethers.deployContract("HealthRecords");

await healthRecords.waitForDeployment();

console.log("Deployment successful!");
console.log("Contract address:", await healthRecords.getAddress());