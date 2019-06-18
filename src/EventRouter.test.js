import Router from './EventRouter';
import axios from 'axios';
import _ from 'lodash';
import Web3 from 'web3';

const URL = "https://mainnet.infura.io";
const BASE_ABI_URL = "https://api.etherscan.io/api?module=contract&action=getabi&address=";
const CONTRACT = "0x06012c8cf97bead5deae237070f9587f8e7a266d";
const NETWORK = 'mainnet';

const fetchABI = async () => {
  let abiUrl = BASE_ABI_URL + CONTRACT;

  let r = await axios.get(abiUrl);
  let res = _.get(r, "data.result");
  if (!res) {
    throw new Error(`unable to fetch ABI from ${abiUrl}`);
  }

  let abi = res;
  if (typeof abi === 'string') {
    abi = JSON.parse(res);
  }

  if (!abi.length) {
    throw new Error(`unable to parse ABI: ${res}`);
  }

  return abi;
}

const sleep = time => {
  return new Promise((done)=>{
    setTimeout(done, time);
  })
}

describe("EventRouter", ()=>{
  it("should sync and then stream new events", done=>{
    let web3Factory = () => new Web3(new Web3.providers.HttpProvider(URL));
    fetchABI()
    .then(abi=>{
      let router = new Router({
        abi,
        address: CONTRACT,
        web3Factory
      });
      let txnCount = 0;
      router.use((txns, next, end)=>{
        console.log("Getting ", txns.length + " transactions as router payload");
        txnCount += txns.length;
        next();
      });

      router.start({
        fromBlock: 7984833
      }).then(()=>{
        if(txnCount === 0) {
          done(new Error("Expected at least one txn"));
        }
        router.stop()
        .then(done);
      })
    })
    .catch(done);
  }).timeout(20000);
});
