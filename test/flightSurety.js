
var Test = require('../config/testConfig.js');
var BigNumber = require('bignumber.js');
var Web3 = require('web3');

contract('Flight Surety Tests', async (accounts) => {

  const TEST_ORACLES_COUNT = 20;
  const STATUS_CODE_UNKNOWN = 0;
  const STATUS_CODE_LATE_AIRLINE = 20;
  const STATUS_CODE_LATE_WEATHER = 30;
  var config;
  var flightTimestamp;
  before('setup contract', async () => {
    config = await Test.Config(accounts);
    await config.flightSuretyData.authorizeCaller(config.flightSuretyApp.address, { from: accounts[0] });
  });

  /****************************************************************************************/
  /* Operations and Settings                                                              */
  /****************************************************************************************/
  
  it(`(multiparty) has correct initial isOperational() value`, async function () {

    // Get operating status
    let status = await config.flightSuretyData.isOperational.call();
    assert.equal(status, true, "Incorrect initial operating status value");

  });

  it(`(multiparty) can block access to setOperatingStatus() for non-Contract Owner account`, async function () {

      // Ensure that access is denied for non-Contract Owner account
      let accessDenied = false;
      try 
      {
          await config.flightSuretyData.setOperatingStatus(false, { from: config.testAddresses[2] });
      }
      catch(e) {
          accessDenied = true;
      }
      assert.equal(accessDenied, true, "Access not restricted to Contract Owner");
            
  });

  it(`(multiparty) can allow access to setOperatingStatus() for Contract Owner account`, async function () {

      // Ensure that access is allowed for Contract Owner account
      let accessDenied = false;
      try 
      {
          await config.flightSuretyData.setOperatingStatus(false);
      }
      catch(e) {
          accessDenied = true;
      }
      assert.equal(accessDenied, false, "Access not restricted to Contract Owner");
      
  });

  it(`(multiparty) can block access to functions using requireIsOperational when operating status is false`, async function () {

      await config.flightSuretyData.setOperatingStatus(false);

      let reverted = false;
      try 
      {
          await config.flightSurety.setTestingMode(true);
      }
      catch(e) {
          reverted = true;
      }
      assert.equal(reverted, true, "Access not blocked for requireIsOperational");      

      // Set it back for other tests to work
      await config.flightSuretyData.setOperatingStatus(true);

  });

  it('(airline) cannot register an Airline using registerAirline() if it is not funded', async () => {
    
    // ARRANGE
    let newAirline = accounts[2];

    // ACT
    try {
        await config.flightSuretyApp.registerAirline(newAirline, {from: config.firstAirline});
    }
    catch(e) {

    }
    let result = await config.flightSuretyData.isAirline.call(newAirline); 

    // ASSERT
    assert.equal(result, false, "Airline should not be able to register another airline if it hasn't provided funding");

  });

  it('(airline) Register an airline without consensus', async () => {
    let funds = await config.flightSuretyData.MIN_FUND.call();

    // ACT
    try {
        await config.flightSuretyData.fund({from: accounts[0], value: funds});
        await config.flightSuretyApp.registerAirline(config.firstAirline, "Test airline 2", {from: accounts[0]});
    }
    catch(e) {
      console.log(e);
    }
    let airlinesTotalCount = await config.flightSuretyData.airlinesTotalCount.call(); 
    let result = await config.flightSuretyData.isAirline.call(config.firstAirline); 

    // ASSERT
    assert.equal(result, true, "Airline register another airline directly if there are less than 4 registered");
    assert.equal(airlinesTotalCount, 2, "Airlines count should be 1 after deploy contract.");
  });
  
  it("(airline) Cant register an airline without consensus", async () => {

    // ACT
    try {
        await config.flightSuretyApp.registerAirline(accounts[2], "Test airline 3", {from: accounts[0]});
        await config.flightSuretyApp.registerAirline(accounts[3], "Test airline 4", {from: accounts[0]});
        await config.flightSuretyApp.registerAirline(accounts[4], "Test airline 5", {from: accounts[0]});
    }
    catch(e) {
      console.log(e);
    }
    let result2 = await config.flightSuretyData.isAirline.call(accounts[2]);
    let result3 = await config.flightSuretyData.isAirline.call(accounts[3]);
    let result4 = await config.flightSuretyData.isAirline.call(accounts[4]);
    let airlinesTotalCount = await config.flightSuretyData.airlinesTotalCount.call(); 

    // ASSERT
    assert.equal(result2, true, "Airline 2 should be register directly");
    assert.equal(result3, true, "Airline 3 should be register directly");
    assert.equal(result4, false, "Airline 4 should not be able to register another airline if it hasn't provided funding");
    assert.equal(airlinesTotalCount, 4, "Airlines count should be 1 after deploy contract.");
  });

  it("(airline) Register an airline with consensus", async () => {
    // ARRANGE
    let funds = await config.flightSuretyData.MIN_FUND.call();

    // ACT
    try {
        await config.flightSuretyData.fund({from: accounts[1], value: funds});
        await config.flightSuretyApp.registerAirline(accounts[4], "Test airline 4", {from: accounts[1]});
    }
    catch(e) {
      console.log(e);
    }
    let result4 = await config.flightSuretyData.isAirline.call(accounts[4]);
    let airlinesTotalCount = await config.flightSuretyData.airlinesTotalCount.call(); 

    // ASSERT
    assert.equal(result4, true, "Airline 4 should not be able to register another airline if it hasn't provided funding");
    assert.equal(airlinesTotalCount, 5, "Airlines count should be 1 after deploy contract.");
  });

  it('(flight) Register a flight using registerFlight()', async () => {
    // ARRANGE
    timestamp = Math.floor(Date.now() / 1000); //convert timestamp from miliseconds (javascript) to seconds (solidity)

    // ACT
    try {
        await config.flightSuretyApp.registerFlight("VN321", timestamp, {from: config.firstAirline});
    }
    catch(e) {
      console.log(e);
    }

    let result = await config.flightSuretyApp.getFlightStatus("VN321", config.firstAirline);
    assert.equal(result, STATUS_CODE_UNKNOWN, "Flight status should be STATUS_CODE_UNKNOWN.");
  });

  it("(passenger) pay 1 ether for purchasing flight insurance.", async () => {
    // ARRANGE
    let price = await config.flightSuretyData.INSURANCE_PRICE_LIMIT.call();

    // ACT
    try {
        await config.flightSuretyData.buy("VN321", {from: config.firstPassenger, value: price});
    }
    catch(e) {
      console.log(e);
    }

    let registeredPassenger = await config.flightSuretyData.passengerAddrList.call(0); 
    assert.equal(registeredPassenger, config.firstPassenger, "Passenger wasnt bought a ticket.");
  });

  it("Upon startup, 20+ oracles are registered and their assigned indexes are persisted in memory", async () => {
    // ARRANGE
    let fee = await config.flightSuretyApp.REGISTRATION_FEE.call();

    // ACT
    for(let index = 20; index < (TEST_ORACLES_COUNT + 20); index++) {      
      await config.flightSuretyApp.registerOracle({ from: accounts[index], value: fee});
      let result = await config.flightSuretyApp.getMyIndexes.call({ from: accounts[index]});
      assert.equal(result.length, 3, 'Oracle should be registered with three indexes');
    }
  });

  it("Server will loop through all registered oracles, set STATUS_CODE_LATE_AIRLINE, and check  ", async () => {
    // ARRANGE
    let flightID = 'VN321';
    let timestamp = Math.floor(Date.now() / 1000); //convert timestamp from miliseconds (javascript) to seconds (solidity)
    let price = await config.flightSuretyData.INSURANCE_PRICE_LIMIT.call();

    // ACT
    await config.flightSuretyApp.fetchFlightStatus(config.firstAirline, flightID, timestamp);

    for(let index = 20; index < (TEST_ORACLES_COUNT + 10); index++) {
      let oracleIndexes = await config.flightSuretyApp.getMyIndexes({from: accounts[index]});
      for(let idx=0;idx<3;idx++) {
        try {
          await config.flightSuretyApp.submitOracleResponse(oracleIndexes[idx], config.firstAirline, flightID, timestamp, STATUS_CODE_LATE_AIRLINE, { from: accounts[index] });
        } catch(e) {
          // console.log(e);
          // console.log("index: " + index + " + idx: " + idx);
        }
      }
    }
    let flightStatus = await config.flightSuretyApp.getFlightStatus(flightID, config.firstAirline);
    let creditToPay = await config.flightSuretyData.getCreditToPay.call({from: config.firstPassenger}); 
    assert.equal(STATUS_CODE_LATE_AIRLINE, flightStatus.toString(), 'Flight status need to be STATUS_CODE_LATE_AIRLINE');
    assert.equal(creditToPay, price * 1.5, "Passenger need be paid 1.5 ETH.");
  });
  
  it("(passenger) pay funds as a result of credit for insurance payout", async () => {
    let creditToPay = await config.flightSuretyData.getCreditToPay.call({from: config.firstPassenger});

    let passengerOriginalBalance = await web3.eth.getBalance(config.firstPassenger);
    console.log("passengerOriginalBalance: " + passengerOriginalBalance);
    let receipt = await config.flightSuretyData.withdraw(config.firstPassenger, {from: config.firstPassenger});
    let passengerFinalBalance = await web3.eth.getBalance(config.firstPassenger);
    console.log("passengerFinalBalance: " + passengerFinalBalance);
    console.log("receipt: " + receipt);

    // Obtain total gas cost
    const gasUsed = Number(receipt.receipt.gasUsed);
    const tx = await web3.eth.getTransaction(receipt.tx);
    const gasPrice = Number(tx.gasPrice);
    
    let finalCredit = await config.flightSuretyData.getCreditToPay.call({from: config.firstPassenger});
    
    assert.equal(finalCredit.toString(), 0, "Passenger should have transfered the ethers to its wallet.");
    assert.equal(Number(passengerOriginalBalance) + Number(creditToPay) - (gasPrice * gasUsed), Number(passengerFinalBalance), "Passengers balance should have increased the amount it had credited");
  });

});
