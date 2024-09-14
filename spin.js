const ethers = require("ethers");
const readline = require("readline");
const Writable = require("stream").Writable;

const provider = new ethers.JsonRpcProvider("https://ronin.lgns.net/rpc");
const contractAddress = "0x2b7e3ddd371f4593d3d488e2eff14381d1d3ec58";
const contractABI = [
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "paymentCount",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
];
const contract = new ethers.Contract(contractAddress, contractABI, provider);

var mutableStdout = new Writable({
  write: function (chunk, encoding, callback) {
    if (!this.muted) process.stdout.write(chunk, encoding);
    callback();
  },
});

const generateHexStringFromNumber = (number) => {
  const input = `kaidro_gacha_${number}`;
  const inputBytes = ethers.toUtf8Bytes(input);
  const hash = ethers.keccak256(inputBytes);
  return hash.slice(2); // Remove '0x' prefix
};

const getPaymentCount = async (address) => {
  try {
    const count = await contract.paymentCount(address);
    return count + BigInt(1);
  } catch (error) {
    console.error("Error getting payment count:", error);
    return null;
  }
};

async function sendRoninTransaction(wallet) {
  const paymentCount = await getPaymentCount(wallet.address);
  if (paymentCount === null) {
    console.error("Failed to get payment count. Aborting transaction.");
    return;
  }

  const tx = {
    to: contractAddress,
    data: `0x33122449${generateHexStringFromNumber(paymentCount)}`,
  };

  try {
    const transaction = await wallet.sendTransaction(tx);
    console.log("Transaction sent:", transaction.hash);

    const receipt = await transaction.wait();
    console.log("Transaction confirmed in block:", receipt.blockNumber);
    return true;
  } catch (error) {
    console.error("Error sending transaction:", error);
    return false;
  }
}

async function getUserInput() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: mutableStdout,
    terminal: true,
  });

  console.log("╔════════════════════════════════════════╗");
  console.log("║           KAIDRO SPIN SCRIPT           ║");
  console.log("╚════════════════════════════════════════╝");
  console.log("\nEnter your private key:");
  mutableStdout.muted = true;
  const privateKey = await new Promise((resolve) => {
    rl.question("", (answer) => {
      resolve(answer.trim());
    });
  });
  mutableStdout.muted = false;
  if (!ethers.isHexString(privateKey, 32)) {
    rl.close();
    throw new Error("Invalid private key");
  }
  const spins = await new Promise((resolve) => {
    rl.question(
      "How many spins do you want? (type 'all' or a number): ",
      (answer) => {
        const parsed = answer.toLowerCase().trim();
        resolve(parsed === "all" ? "all" : parseInt(parsed, 10));
      }
    );
  });

  const delay = await new Promise((resolve) => {
    rl.question("Delay between each spin? (in seconds): ", (answer) => {
      resolve(Math.max(0, parseInt(answer, 10)) * 1000);
    });
  });

  rl.close();
  return { privateKey, spins, delay };
}

async function start() {
  try {
    const { privateKey, spins, delay } = await getUserInput();
    if (!privateKey) {
      throw new Error("Invalid private key provided.");
    }

    const wallet = new ethers.Wallet(privateKey, provider);
    let spinCount = 0;

    while (spins === "all" || spinCount < spins) {
      console.log(
        `\n[${new Date().toLocaleTimeString()}] Initiating spin ${
          spinCount + 1
        }...`
      );
      const success = await sendRoninTransaction(wallet);
      if (success) {
        spinCount++;
      } else {
        console.log("Spin failed. Retrying...");
      }

      if (spins !== "all" && spinCount >= spins) break;

      console.log(`Waiting for ${delay / 1000} seconds before next spin...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    console.log("\nSpinning complete!");
  } catch (error) {
    console.error("An error occurred:", error.message);
  }
}

start();
