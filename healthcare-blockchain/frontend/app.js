let provider;
let signer;
let contract;
let contractAbi;

const HARDHAT_CHAIN_ID = "0x7A69";
const HARDHAT_RPC_URL = "http://127.0.0.1:8545";

const contractAddressInput = document.getElementById("contractAddress");
const walletAddressElement = document.getElementById("walletAddress");
const networkNameElement = document.getElementById("networkName");
const statusElement = document.getElementById("status");

const savedAddress = localStorage.getItem("healthRecordsContract");

if (savedAddress) {
  contractAddressInput.value = savedAddress;
}

function showStatus(message, isError = false) {
  statusElement.style.display = "block";
  statusElement.style.background = isError ? "#fee2e2" : "#dbeafe";
  statusElement.style.color = isError ? "#991b1b" : "#1e3a8a";
  statusElement.textContent = message;
}

function requireContract() {
  if (!contract) {
    throw new Error(
      "Connect MetaMask and save the contract address first."
    );
  }
}

function validateAddress(address, fieldName) {
  if (!ethers.isAddress(address)) {
    throw new Error(`Enter a valid ${fieldName}.`);
  }
}

async function switchToHardhatNetwork() {
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: HARDHAT_CHAIN_ID }],
    });
  } catch (error) {
    if (error.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: HARDHAT_CHAIN_ID,
            chainName: "Hardhat Local",
            nativeCurrency: {
              name: "Ethereum",
              symbol: "ETH",
              decimals: 18,
            },
            rpcUrls: [HARDHAT_RPC_URL],
          },
        ],
      });
    } else {
      throw error;
    }
  }
}

async function loadAbi() {
  if (contractAbi) {
    return contractAbi;
  }

  const response = await fetch("./abi.json");

  if (!response.ok) {
    throw new Error(
      "Could not load abi.json. Make sure it exists inside the frontend folder."
    );
  }

  contractAbi = await response.json();
  return contractAbi;
}

async function connectWallet() {
  try {
    if (!window.ethereum) {
      throw new Error("MetaMask is not installed.");
    }

    showStatus("Connecting to MetaMask...");

    await window.ethereum.request({
      method: "eth_requestAccounts",
    });

    const currentChainId = await window.ethereum.request({
      method: "eth_chainId",
    });

    if (currentChainId.toLowerCase() !== HARDHAT_CHAIN_ID.toLowerCase()) {
      await switchToHardhatNetwork();
    }

    provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner();

    const walletAddress = await signer.getAddress();
    const network = await provider.getNetwork();

    walletAddressElement.textContent = walletAddress;
    networkNameElement.textContent =
      `Hardhat Local — Chain ID ${network.chainId}`;

    const contractAddress = contractAddressInput.value.trim();

    if (!ethers.isAddress(contractAddress)) {
      contract = undefined;

      showStatus(
        "Wallet connected. Now paste the deployed contract address and click Save Contract Address."
      );

      return;
    }

    const abi = await loadAbi();
    const contractCode = await provider.getCode(contractAddress);

    if (contractCode === "0x") {
      throw new Error(
        "No contract was found at this address. Redeploy the contract and use its new address."
      );
    }

    contract = new ethers.Contract(contractAddress, abi, signer);

    showStatus(`Connected successfully as ${walletAddress}`);

    await refreshAuditLog();
  } catch (error) {
    console.error(error);
    showStatus(error.shortMessage || error.message, true);
  }
}

async function saveContractAddress() {
  try {
    const address = contractAddressInput.value.trim();

    validateAddress(address, "contract address");

    localStorage.setItem("healthRecordsContract", address);

    showStatus("Contract address saved. Connecting to the contract...");

    await connectWallet();
  } catch (error) {
    console.error(error);
    showStatus(error.shortMessage || error.message, true);
  }
}

async function sendTransaction(button, message, transactionFunction) {
  const originalText = button.textContent;

  try {
    requireContract();

    button.disabled = true;
    button.textContent = "Waiting...";

    showStatus(message);

    const transaction = await transactionFunction();

    showStatus("Transaction submitted. Waiting for confirmation...");

    await transaction.wait();

    showStatus("Transaction completed successfully.");

    await refreshAuditLog();
  } catch (error) {
    console.error(error);

    const message =
      error.reason ||
      error.shortMessage ||
      error.message ||
      "Transaction failed.";

    showStatus(message, true);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

document
  .getElementById("connectWalletButton")
  .addEventListener("click", connectWallet);

document
  .getElementById("saveContractButton")
  .addEventListener("click", saveContractAddress);

document
  .getElementById("verifyProviderButton")
  .addEventListener("click", async function () {
    const doctorAddress = document
      .getElementById("providerAddress")
      .value.trim();

    try {
      validateAddress(doctorAddress, "doctor address");

      await sendTransaction(
        this,
        "Verifying doctor...",
        () => contract.setVerifiedProvider(doctorAddress, true)
      );
    } catch (error) {
      showStatus(error.message, true);
    }
  });

document
  .getElementById("anchorRecordButton")
  .addEventListener("click", async function () {
    const fileInput = document.getElementById("medicalFile");
    const metadataInput = document.getElementById("recordMetadata");

    try {
      if (!fileInput.files.length) {
        throw new Error("Select a medical file first.");
      }

      const file = fileInput.files[0];
      const fileBytes = new Uint8Array(await file.arrayBuffer());

      const fileHash = ethers.keccak256(fileBytes);

      const metadata =
        metadataInput.value.trim() || file.name;

      const metadataHash = ethers.keccak256(
        ethers.toUtf8Bytes(metadata)
      );

      await sendTransaction(
        this,
        "Adding the medical record hash...",
        () => contract.anchorMedicalRecord(fileHash, metadataHash)
      );

      fileInput.value = "";
      metadataInput.value = "";
    } catch (error) {
      showStatus(error.message, true);
    }
  });

document
  .getElementById("grantAccessButton")
  .addEventListener("click", async function () {
    const doctorAddress = document
      .getElementById("grantDoctorAddress")
      .value.trim();

    try {
      validateAddress(doctorAddress, "doctor address");

      await sendTransaction(
        this,
        "Granting access...",
        () => contract.grantAccess(doctorAddress)
      );
    } catch (error) {
      showStatus(error.message, true);
    }
  });

document
  .getElementById("revokeAccessButton")
  .addEventListener("click", async function () {
    const doctorAddress = document
      .getElementById("revokeDoctorAddress")
      .value.trim();

    try {
      validateAddress(doctorAddress, "doctor address");

      await sendTransaction(
        this,
        "Revoking access...",
        () => contract.revokeAccess(doctorAddress)
      );
    } catch (error) {
      showStatus(error.message, true);
    }
  });

document
  .getElementById("flagEmergencyButton")
  .addEventListener("click", async function () {
    const accessId = document
      .getElementById("emergencyAccessId")
      .value;

    try {
      if (!accessId || Number(accessId) < 1) {
        throw new Error("Enter a valid emergency access ID.");
      }

      await sendTransaction(
        this,
        "Flagging emergency access...",
        () => contract.flagForReview(BigInt(accessId))
      );
    } catch (error) {
      showStatus(error.message, true);
    }
  });

document
  .getElementById("requestAccessButton")
  .addEventListener("click", async function () {
    const patientAddress = document
      .getElementById("requestPatientAddress")
      .value.trim();

    try {
      validateAddress(patientAddress, "patient address");

      await sendTransaction(
        this,
        "Requesting patient access...",
        () => contract.requestAccess(patientAddress)
      );
    } catch (error) {
      showStatus(error.message, true);
    }
  });

document
  .getElementById("emergencyAccessButton")
  .addEventListener("click", async function () {
    const patientAddress = document
      .getElementById("emergencyPatientAddress")
      .value.trim();

    const reason = document
      .getElementById("emergencyReason")
      .value.trim();

    try {
      validateAddress(patientAddress, "patient address");

      if (!reason) {
        throw new Error("Enter the emergency reason.");
      }

      await sendTransaction(
        this,
        "Requesting emergency access...",
        () => contract.requestEmergencyAccess(patientAddress, reason)
      );
    } catch (error) {
      showStatus(error.message, true);
    }
  });

document
  .getElementById("logAccessButton")
  .addEventListener("click", async function () {
    const patientAddress = document
      .getElementById("accessPatientAddress")
      .value.trim();

    const recordId = document
      .getElementById("accessRecordId")
      .value;

    try {
      validateAddress(patientAddress, "patient address");

      if (!recordId || Number(recordId) < 1) {
        throw new Error("Enter a valid record ID.");
      }

      await sendTransaction(
        this,
        "Logging medical record access...",
        () =>
          contract.logRecordAccess(
            patientAddress,
            BigInt(recordId)
          )
      );
    } catch (error) {
      showStatus(error.message, true);
    }
  });

document
  .getElementById("refreshAuditButton")
  .addEventListener("click", refreshAuditLog);

function formatEventValue(value) {
  if (typeof value === "bigint") {
    return value.toString();
  }

  return String(value);
}

async function refreshAuditLog() {
  const auditList = document.getElementById("auditList");

  try {
    requireContract();

    auditList.textContent = "Loading blockchain events...";

    const address = await contract.getAddress();
    const latestBlock = await provider.getBlockNumber();

    const logs = await provider.getLogs({
      address,
      fromBlock: 0,
      toBlock: latestBlock,
    });

    auditList.innerHTML = "";

    if (logs.length === 0) {
      auditList.textContent = "No blockchain events found.";
      return;
    }

    const orderedLogs = [...logs].reverse();

    for (const log of orderedLogs) {
      let parsedLog;

      try {
        parsedLog = contract.interface.parseLog({
          topics: log.topics,
          data: log.data,
        });
      } catch {
        continue;
      }

      if (!parsedLog) {
        continue;
      }

      const entry = document.createElement("div");
      entry.className = "audit-entry";

      const title = document.createElement("strong");
      title.textContent = parsedLog.name;

      const details = document.createElement("div");

      const eventValues = parsedLog.fragment.inputs.map(
        (input, index) => {
          const name = input.name || `value${index + 1}`;
          const value = formatEventValue(parsedLog.args[index]);

          return `${name}: ${value}`;
        }
      );

      details.textContent =
        `Block ${log.blockNumber} | ${eventValues.join(" | ")}`;

      entry.appendChild(title);
      entry.appendChild(document.createElement("br"));
      entry.appendChild(details);

      auditList.appendChild(entry);
    }
  } catch (error) {
    console.error(error);
    auditList.textContent = error.shortMessage || error.message;
  }
}

if (window.ethereum) {
  window.ethereum.on("accountsChanged", () => {
    connectWallet();
  });

  window.ethereum.on("chainChanged", () => {
    window.location.reload();
  });
}