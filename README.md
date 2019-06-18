# Overview
Routes events through a stack of installed handlers similar to the way express passes request/response through a stack of handlers. Relies on eth-sync to first bring in historical events from a specified block and then continues from that point to retrieve all live events. Handlers are called for synchronized and live events so it's transparent to the handlers whether the events are live or replay.

## Design Considerations

### Subscriptions
eth-event-router relies on block subscriptions vs. event subscriptions. Some versions of web3/MetaMask had leaking event subscriptions that would result in multiple event callbacks after loading a DApp several times. Infura's websocket endpoint is also experimental (as of June, 2019) leading to problems with subscriptions in general. So the router uses 15-second polling to pull in new blocks and then uses eth-sync to retrieve any new blocks since the last txn received for the app. Why not the last known block? If we receive block 7,984,830 and attempt to get log events for a DApp, Infura may not have indexed the events yet. If we just skipped that block and went on from there, we could miss data when Infura finally does index events for that block. Therefore, we always pull from the last block that contained transactions for our DApp.

### Web3 Factory
eth-event-router, and eth-sync for that matter, both expect a factory function to create web3 instances. This decision was to account for the HttpProvider attempting to keep connections alive. Experience with web3 tells us that keeping the HttpProvider around for a long time results in stale connection problems that ultimately end up returning "JSON RPC Errors" of an unknown origin. To make sure this doesn't happen, the web3 factory function should provide a fresh instance of web3 so that each processing cycle within eth-sync or eth-event-router can use the instance and discard as needed. 

# Installation
```
npm install eth-event-router
```

# Usage
```javascript
   //assume import EventRouter from 'eth-event-router';
   let router = new EventRouter({
      abi: _contract_abi_,
      address: _contract_address_,
      web3Factory: () => createWeb3Instance()
   });
   router.use((txns, next, end)=>{
      
      //calling next uses same txn payload in next route
      //calling end uses payload provided to end as input to the next route
      //
      //in this case, we extract only the logEvent mapping from each txn into a 
      //single event map and hand it to the next handler
      end(null, _extractLogs(txns)); 
   });
   
   router.use((eventMap, next, end)=>{
      //get the events we care about 
      let transfers = eventMap["Transfer"];
      ...
   });
   
   router.start({
      fromBlock: 7984833
   }).then(()=>{
     //sync complete, now live streaming.
     //
     //when live events no longer needed
     router.stop()
     .then(()=>{//done});
   });
```
