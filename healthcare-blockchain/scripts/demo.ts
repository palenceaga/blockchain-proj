import { network } from "hardhat";
import { keccak256, toUtf8Bytes } from "ethers";

const CONTRACT_ADDRESS = "0x5fbdb2315678afecb367f032d93f642f64180aa3";

const { ethers } = await network.create();
const [admin, patient, doctor] = await ethers.getSigners();

const patientAddress = await patient.getAddress();
const doctorAddress = await doctor.getAddress();

const adminContract = await ethers.getContractAt(
  "HealthRecords",
  CONTRACT_ADDRESS,
  admin
);

const patientContract = await ethers.getContractAt(
  "HealthRecords",
  CONTRACT_ADDRESS,
  patient
);

const doctorContract = await ethers.getContractAt(
  "HealthRecords",
  CONTRACT_ADDRESS,
  doctor
);

// 1. Admin verifies doctor
let transaction = await adminContract.setVerifiedProvider(
  doctorAddress,
  true
);
await transaction.wait();

console.log("1. Doctor verified by Admin");

// 2. Patient anchors a medical-record hash
const recordId = await patientContract.nextRecordId();

const fileHash = keccak256(
  toUtf8Bytes(`encrypted-medical-file-${Date.now()}`)
);

const metadataHash = keccak256(
  toUtf8Bytes("encrypted-medical-metadata")
);

transaction = await patientContract.anchorMedicalRecord(
  fileHash,
  metadataHash
);
await transaction.wait();

console.log("2. Medical record anchored. Record ID:", recordId.toString());

// 3. Doctor requests access
transaction = await doctorContract.requestAccess(patientAddress);
await transaction.wait();

console.log("3. Doctor requested access");

// 4. Patient grants access
transaction = await patientContract.grantAccess(doctorAddress);
await transaction.wait();

console.log("4. Patient granted access");

let accessAllowed = await doctorContract.hasAccess(
  patientAddress,
  doctorAddress
);

console.log("5. Normal access allowed:", accessAllowed);

// 5. Doctor accesses the record
transaction = await doctorContract.logRecordAccess(
  patientAddress,
  recordId
);
await transaction.wait();

console.log("6. Record access logged");

// 6. Patient revokes access
transaction = await patientContract.revokeAccess(doctorAddress);
await transaction.wait();

accessAllowed = await doctorContract.hasAccess(
  patientAddress,
  doctorAddress
);

console.log("7. Access after revocation:", accessAllowed);

// 7. Doctor requests emergency access
const emergencyAccessId = await doctorContract.nextAccessId();

transaction = await doctorContract.requestEmergencyAccess(
  patientAddress,
  "Critical emergency treatment"
);
await transaction.wait();

accessAllowed = await doctorContract.hasAccess(
  patientAddress,
  doctorAddress
);

console.log("8. Emergency access allowed:", accessAllowed);

// 8. Patient flags emergency access for review
transaction = await patientContract.flagForReview(
  emergencyAccessId
);
await transaction.wait();

const emergencyRecord =
  await patientContract.getAccessRecord(emergencyAccessId);

console.log(
  "9. Emergency access flagged:",
  emergencyRecord.flaggedForReview
);

console.log("Blockchain workflow test completed successfully!");