# Overview
Routes events through a stack of installed handlers similar to the way express passes request/response through a stack of handlers. Relies on eth-sync to first bring in historical events from a specified block and then continues from that point to retrieve all live events. Handlers are called for synchronized and live events so it's transparent to the handlers whether the events are live or replay.

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
