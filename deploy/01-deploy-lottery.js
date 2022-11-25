const { network, ethers } = require("hardhat")
const { developmentChains, networkConfig } = require("../helper-hardhat-config")
const { verify } = require("../helper-hardhat-config")

const VRF_SUB_FUND_AMOUNT = "2500000000000000"

module.exports = async ({ getNamedAccounts, deployments }) => {
    const {deploy, log, get} = deployments
    const {deployer} = await getNamedAccounts()
    const chainId = network.config.chainId
    let vrfCoordinatorV2Address, subId

    if (chainId == 31337) {
        const VRFCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock")
        vrfCoordinatorV2Address = VRFCoordinatorV2Mock.address
        const trResp = await VRFCoordinatorV2Mock.createSubscription()
        const trReceipt = await trResp.wait(1)
        subId = trReceipt.events[0].args.subId
        await VRFCoordinatorV2Mock.fundSubscription(subId, VRF_SUB_FUND_AMOUNT)
    } else {
        vrfCoordinatorV2Address = networkConfig[chainId]["VRFCoordinatorV2"] 
        subId = networkConfig[chainId]["subscriptionId"]
    }

    const callbackGasLimit = networkConfig[chainId]["callbackGasLimit"]
    const entranceFee = networkConfig[chainId]["entranceFee"]
    const interval = networkConfig[chainId]["interval"]
    const gasLane = networkConfig[chainId]["gasLane"]
    const args = [vrfCoordinatorV2Address, entranceFee, gasLane, subId, callbackGasLimit, interval]
    const lottery = await deploy("Lottery", {
        from: deployer,
        args: args,
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })

    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        log("Verifying")
        await verify(raffle.address, args)
    }

    log("--------------------------------------------------------------")
}

module.exports.tags = ["all", "lottery"]
