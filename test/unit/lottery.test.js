const { assert, expect } = require("chai")
const { network, getNamedAccounts, deployments, ethers } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name) ? describe.skip : describe("Lottery", async () => {
    let lottery, vrfCoordinatorV2Mock, chainId, raffleEnteranceFee, deployer

    beforeEach(async () => {
        deployer = (await getNamedAccounts()).deployer
        await deployments.fixture(["all"])
        lottery = await ethers.getContract("Lottery", deployer)
        vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)
        chainId = network.config.chainId
        lotteryEnteranceFee = await lottery.getEnteranceFee()
    })

    describe("constructor", async () => {
        it("Init the lottery correctly", async () => {
            const lotteryState = await lottery.getLotteryState()
            const interval = await lottery.getInterval()
            assert.equal(lotteryState.toString(), "0")
            assert.equal(interval.toString(), networkConfig[chainId]["interval"])
        })
    })

    describe("Enter lottery", async () => {
        it("revert if you dont pay enough", async () => {
            await expect(lottery.enterLottery()).to.be.revertedWith('Lottery__NotEnoughETHEntered')
        })
        
        it("records players when they entered", async () => {
            await lottery.enterLottery({value: lotteryEnteranceFee})
            const contractPlayer  = await lottery.getPlayer(0)
            assert.equal(deployer, contractPlayer)
        })

    })
})