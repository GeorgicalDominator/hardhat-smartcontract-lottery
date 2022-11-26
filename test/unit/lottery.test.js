const { assert, expect } = require("chai")
const { network, getNamedAccounts, deployments, ethers } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name) ? describe.skip : describe("Lottery", () => {
    let lottery, vrfCoordinatorV2Mock, chainId, raffleEnteranceFee, deployer, interval

    beforeEach(async () => {
        deployer = (await getNamedAccounts()).deployer
        await deployments.fixture(["all"])
        lottery = await ethers.getContract("Lottery", deployer)
        vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)
        subscriptionId = await lottery.getSubscriptionId()
        await vrfCoordinatorV2Mock.addConsumer(subscriptionId, lottery.address)
        chainId = network.config.chainId
        lotteryEnteranceFee = await lottery.getEnteranceFee()
        interval = await lottery.getInterval()
    })

    describe("constructor", () => {
        it("Init the lottery correctly", async () => {
            const lotteryState = await lottery.getLotteryState() 
            assert.equal(lotteryState.toString(), "0")
            assert.equal(interval.toString(), networkConfig[chainId]["interval"])
        })
    })

    describe("Enter lottery", () => {
        it("revert if you dont pay enough", async () => {
            await expect(lottery.enterLottery()).to.be.revertedWith('Lottery__NotEnoughETHEntered')
        })
        
        it("records players when they entered", async () => {
            await lottery.enterLottery({value: lotteryEnteranceFee})
            const contractPlayer  = await lottery.getPlayer(0)
            assert.equal(deployer, contractPlayer)
        })

        it("emits event on enter", async () => {
            await expect(lottery.enterLottery({value:lotteryEnteranceFee})).to.emit(lottery, "LotteryEnter")
        })

        it("doesnt allow enterance when lottery is calculating", async () => {
            await lottery.enterLottery({value:lotteryEnteranceFee})
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.send("evm_mine", [])
            await lottery.performUpkeep([])
            await expect(lottery.enterLottery({value:lotteryEnteranceFee})).to.be.revertedWith('Lottery__NotOpen')
        })
    })
    
    describe("checkUpkeep", () => { 
        it("returns false if people haven't sent any ETH", async () => {
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.send("evm_mine", [])
            const { upkeepNeeded } =  await lottery.callStatic.checkUpkeep([])    
            assert(!upkeepNeeded)
        })

        it("returns false if lottery isn't open", async () => {
            await lottery.enterLottery({value:lotteryEnteranceFee})       
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.send("evm_mine", [])
            await lottery.performUpkeep([])
            const lotteryState = await lottery.getLotteryState()
            const { upkeepNeeded } =  await lottery.callStatic.checkUpkeep([])
            assert.equal(lotteryState.toString(), "1")
            assert.equal(upkeepNeeded, false) 
        })
        
        it("returns false if enough time hasn't passed", async () => {
            await lottery.enterLottery({ value: lotteryEnteranceFee })
            await network.provider.send("evm_increaseTime", [interval.toNumber() - 5]) 
            await network.provider.request({ method: "evm_mine", params: [] })
            const { upkeepNeeded } = await lottery.callStatic.checkUpkeep("0x") 
            assert(!upkeepNeeded)
        })

        it("returns true if enough time has passed, has players, eth, and is open", async () => {
            await lottery.enterLottery({ value: lotteryEnteranceFee })
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.request({ method: "evm_mine", params: [] })
            const { upkeepNeeded } = await lottery.callStatic.checkUpkeep("0x") 
            assert(upkeepNeeded)
        })
    })

    describe("performUpkeep", () => {
        it("can be only run if chekupkeep is true", async () => {
            await lottery.enterLottery({ value: lotteryEnteranceFee })
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.send("evm_mine", [])
            const tx = await lottery.performUpkeep([])
            assert(tx)
        })

        it("reverts when chekUpkeep is false", async () => {
            await expect(lottery.performUpkeep([])).to.be.revertedWith("Lottery__UpkeepNotNeeded")
        })

        it("updates the lottery state, emits the event, and calls the vrf coordinator", async () => {
            await lottery.enterLottery({ value: lotteryEnteranceFee })
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.send("evm_mine", [])
            const txResponse = await lottery.performUpkeep([])
            const txReceipt = await txResponse.wait(1)
            const requestId = txReceipt.events[1].args.requestId
            const lotteryState = await lottery.getLotteryState()
            assert(requestId.toNumber() > 0)
            assert(lotteryState.toString() == "1")
        })
    })

    describe("fulfillRandomWords", () => {
        beforeEach(async () => {
            await lottery.enterLottery({value: lotteryEnteranceFee})
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.send("evm_mine", [])
        })

        it("can only be called after perform Upkeep", async () => {
            await expect (vrfCoordinatorV2Mock.fulfillRandomWords(0, lottery.address)).to.be.revertedWith("nonexistent request")
            await expect (vrfCoordinatorV2Mock.fulfillRandomWords(1, lottery.address)).to.be.revertedWith("nonexistent request")
        })
 
        // it("picks a winner, resets the lottery, and sends money", async () => {
        //     const additionalEntrants = 3
        //     const startingAccountsIndex = 1
        //     const accounts = await ethers.getSigners()
        //     for (let i = startingAccountsIndex; i < startingAccountsIndex + additionalEntrants; i++) {
        //         const accountConnectedLottery = lottery.connect(accounts[i])
        //         await accountConnectedLottery.enterLottery({value: lotteryEnteranceFee})
        //     }
        //     const startingTimeStamp = await lottery.getLatestTimeStamp()

        //     await new Promise(async (resolve, reject) => {
        //         lottery.once("WinnerPicked", async () => {
        //             console.log("Found the event!")
        //             try {
        //                 const recentWinner = await lottery.getRecentWinner()
        //                 const lotteryState = await lottery.getLotteryState()
        //                 const endingTimeStamp = await lottery.getLatestTimeStamp()
        //                 const numPlayers = await lottery.getNumberOfPlayers()
        //                 await expect(lottery.getPlayer(0)).to.be.reverted
        //                 assert.equal(recentWinner.toString(), accounts[2].address)
        //                 assert.equal(numPlayers.toString(), 0)
        //                 assert.equal(lotteryState.toString(), "0")
        //                 assert(endingTimeStamp > startingTimeStamp)
        //                 resolve()
        //             } catch (e) {
        //                 reject(e)
        //             }
        //         })

        //         const tx = await lottery.performUpkeep([])
        //         const txReceipt = await tx.wait()
        //         const startingBalance = await accounts[2].getBalance()
        //         await vrfCoordinatorV2Mock.fulfillRandomWords(txReceipt.events[1].args.requestId, lottery.address)


        //     })
        // })
    })
})