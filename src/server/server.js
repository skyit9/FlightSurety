import FlightSuretyApp from '../../build/contracts/FlightSuretyApp.json';
import FlightSuretyData from '../../build/contracts/FlightSuretyData.json';
import Config from './config.json';
import Web3 from 'web3';
import express from 'express';
import cors from 'cors';


let config = Config['localhost'];
let web3 = new Web3(new Web3.providers.WebsocketProvider(config.url.replace('http', 'ws')));
web3.eth.defaultAccount = web3.eth.accounts[0];
let flightSuretyApp = new web3.eth.Contract(FlightSuretyApp.abi, config.appAddress);
let flightSuretyData = new web3.eth.Contract(FlightSuretyData.abi, config.dataAddress);

let oracleAccounts = [];
let oraclesIndexList = [];

const TEST_ORACLES_COUNT = 25;

let STATUS_CODE_UNKNOWN = 0;
let STATUS_CODE_ON_TIME = 10;
let STATUS_CODE_LATE_AIRLINE = 20;
let STATUS_CODE_LATE_WEATHER = 30;
let STATUS_CODE_LATE_TECHNICAL = 40;
let STATUS_CODE_LATE_OTHER = 50;

let flightStatus = STATUS_CODE_ON_TIME;

const app = express();
app.use(cors());

app.listen(80, function () {
  console.log('CORS-enabled web server listening on port 80')
})

app.get('/api', (req, res) => {
  res.send({
    message: 'An API for use with your Dapp!'
  })
})

app.get('/api/status/:status', (req, res) => {
  var status = req.params.status;
  var message = 'Status changed to: ';
  switch(status) {
    case '10':
      flightStatus = STATUS_CODE_ON_TIME;
      message = message.concat("ON TIME");
      break;
    case '20':
      flightStatus = STATUS_CODE_LATE_AIRLINE;
      message = message.concat("LATE AIRLINE");
      break;
    case '30':
      flightStatus = STATUS_CODE_LATE_WEATHER;
      message = message.concat("LATE WEATHER");
      break;
    case '40':
      flightStatus = STATUS_CODE_LATE_TECHNICAL;
      message = message.concat("LATE TECHNICAL");
      break;
    case '50':
      flightStatus = STATUS_CODE_LATE_OTHER;
      message = message.concat("LATE OTHER");
      break;
    default:
      flightStatus = STATUS_CODE_UNKNOWN;
      message = message.concat("UNKNOWN");
      break;
  }
  res.send({
    message: message
  })
})


flightSuretyApp.events.OracleRequest({
    fromBlock: "latest"
  }, function (error, event) {
    if (error){
      console.log(error);
    } 
    console.log(event);
    let index = event.returnValues.index;
    console.log(`Triggered index: ${index}`);
    let idx = 0;
    oraclesIndexList.forEach((indexes) => {
      let oracle = oracleAccounts[idx];
      if(indexes[0] == index || indexes[1] == index || indexes[2] == index) {
        console.log(`Oracle: ${oracle} triggered. Indexes: ${indexes}.`);
        submitOracleResponse(oracle, index, event.returnValues.airline, event.returnValues.flight, event.returnValues.timestamp);
      }
      idx++;
    });
});

flightSuretyData.events.allEvents({
  fromBlock: "latest"
}, function (error, event) {
  if (error){
    console.log("error");
    console.log(error);
  }  else {
    console.log("event:");
    console.log(event);
  }
});

function getOracleAccounts() {
  return new Promise((resolve, reject) => {
    web3.eth.getAccounts().then(accountList => {
      oracleAccounts = accountList.slice(20, 20+TEST_ORACLES_COUNT);
    }).catch(err => {
      reject(err);
    }).then(() => {
      resolve(oracleAccounts);
    });
  });
}

function submitOracleResponse (oracle, index, airline, flight, timestamp) {
  let payload = {
    index: index,
    airline: airline,
    flight: flight,
    timestamp: timestamp,
    statusCode: flightStatus
  } 
  flightSuretyApp.methods
  .submitOracleResponse(index, airline, flight, timestamp, flightStatus)
  .send({ from: oracle,
    gas: 500000,
    gasPrice: 20000000}, (error, result) => {
    if(error){
      console.log(error, payload);
    }
  });

  if(flightStatus == STATUS_CODE_LATE_AIRLINE){
    flightSuretyData.methods.creditInsurees(flight).call({ from: oracle}, (error, result) => {
      if(error){
        console.log(error, payload);
      } else {
        console.log("Credit set for insurees");
      }
    });
  }
}

getOracleAccounts().then(accounts => {
  initOracles(accounts)
  .catch(err => {
    console.log(err.message);
  });
});

function initOracles(accounts) {
  return new Promise((resolve, reject) => {
    flightSuretyApp.methods.REGISTRATION_FEE().call().then(fee => {
      for(let a=0; a<TEST_ORACLES_COUNT; a++) {
        flightSuretyApp.methods.registerOracle().send({
          "from": accounts[a],
          "value": fee,
          "gas": 5000000,
          "gasPrice": 20000000
        }).then(() => {
          flightSuretyApp.methods.getMyIndexes().call({
            "from": accounts[a]
          }).then(result => {
            console.log(`Oracle ${a} Registered at ${accounts[a]} with [${result}] indexes.`);
            oraclesIndexList.push(result);
          }).catch(err => {
            reject(err);
          });
        }).catch(err => {
          reject(err);
        });
      };
      resolve(oraclesIndexList);
    }).catch(err => {
      reject(err);
    });
  });
}

export default app;
