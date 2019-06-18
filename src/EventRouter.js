import Sync from 'eth-sync';
import Logger from './Logger';

const log = new Logger({component: "EventRouter"});

export default class EventRouter {
  constructor(props) {
    this.sync = new Sync(props);
    this.web3Factory = props.web3Factory;
    this.handlers = [];
    this.lastBlock = 0;

    [
      'use',
      'start',
      'stop',
      '_handleTransactions',
      '_startLivestream',
      '_pullBatch'
    ].forEach(fn=>this[fn]=this[fn].bind(this));
  }

  use(handler) {
    if(!handler) {
      return;
    }
    if(typeof handler !== 'function') {
      throw new Error("Invalid handler. Must be (async) function");
    }
    this.handlers.push(handler);
  }

  start({
    fromBlock,
    toBlock,
    event,
    options
  }) {
    log.debug("Starting event router from block", fromBlock);
    return new Promise(async (done,err)=>{
      let web3 = this.web3Factory();
      let latest = 0;
      try {
        latest = await web3.eth.getBlockNumber();
      } catch (e) {
        return err(e);
      }
      if(!latest) {
        return err(new Error("Could not retrieve latest block"));
      }

      log.debug("First synchronizing between blocks", fromBlock, latest);
      this.sync.start({
        fromBlock,
        toBlock: latest,
        event,
        options
      }, async (e, txns) => {
        if(e) {
          return err(e);
        }
        log.debug("Router getting", txns.length, "events from sync");
        await this._handleTransactions({done: ()=>{},error:err}, txns)
      }).then(()=>{
        log.debug("Synchronization complete. Starting event live stream");
        //all caught up
        this.lastBlock = latest+1;
        this._startLivestream({
          event,
          options,
          fromBlock: latest+1
        }).then(done);
      });
    });
  }

  async stop() {
    if(this.sub) {
      log.debug("Stopping router and all subscriptions");
      await this.sub.unsubscribe()
    }
    this.sub = null;
  }

  async _handleTransactions(ctx, txns) {
    let router = new RouterStack({
      handlers: this.handlers,
      context: ctx,
      payload: txns
    });
    await router.start()
  }

  _startLivestream({event, options, fromBlock}) {
    this.sub = new SubManager({
      fromBlock,
      web3Factory: this.web3Factory,
      handler: this._pullBatch
    });
    return this.sub.start();
  }

  async _pullBatch(block) {
    let handler = (e, txns) => {
      if(e) {
        log.error("Problem pulling batch of events", e);
        return;
      }

      if(txns.length > 0) {
        this.lastBlock = txns[0].blockNumber;
        return new Promise((done,err)=>{
          this._handleTransactions({done, error: err}, txns)
          .then(()=>{
            done();
          })
          .catch(e2=>{
            log.error("Problem processing live transactions", e2);
            err(e2);
          });
        });
      }
    }
    await this.sync.start({
      fromBlock: this.lastBlock,
      toBlock: block.number
    }, handler);
  }
}

class RouterStack {
  constructor(props) {
    this.handlers = props.handlers;
    this.context = props.context;
    this.payload = props.payload;
    this.offset = 0;
    [
      'next',
      'end',
      'start',
      '_next'
    ].forEach(fn=>this[fn]=this[fn].bind(this));
  }

  start() {
    return this._next(this.payload);
  }

  next() { //basically a skip or pass through
    ++this.offset;
    //use previous payload for next handler
    return this._next(this.payload);
  }

  async _next(payload) {
    let h = this.handlers[this.offset];
    if(h) {
      try {
        log.debug("Calling handler", this.offset);
        await h(payload, this.next, this.end);
      } catch (e) {
        return this.context.error(e);
      }
    } else {
      log.debug("Finished routing through " + this.handlers.length + " handlers");
      this.payload = null;
      this.context.done();
    }
  }

  end(e, r) {
    if(e) {
      log.error("Problem with handler: " + this.offset, e);
      return this.context.error(e);
    }
    log.debug("Handler: " + this.offset, "replacing stack payload with", r);
    //result replaces current payload from this point
    //in the handler stack. All follow-ons get replaced
    //result as input
    ++this.offset;
    this.payload = r;
    return this._next(r);
  }
}


const POLL_PERIOD = 15000;
class SubManager {
  constructor(props) {
    this.web3Factory = props.web3Factory;
    this.startBlock = props.startBlock;
    this.handler = props.handler;
    [
      'start',
      'unsubscribe',
      '_startPoll'
    ].forEach(fn=>this[fn]=this[fn].bind(this));
  }

  async start() {
    return this._startPoll();
  }

  async unsubscribe() {
    if(this.sub) {
      await this.sub.unsubscribe();
      this.sub = null;
    } else if(this.toID) {
      clearInterval(this.toID);
      this.toID = null;
    }
  }

  _startPoll() {
    log.info("Using polling to get new blocks");

    let running = false;
    let poll = async () => {

      running = true;
      let web3 = this.web3Factory();
      let latest = await web3.eth.getBlockNumber();
      try {
        log.info("Getting new blocks from", this.startBlock,"to",latest);

        if(latest === this.startBlock) {
          return;
        }
        let block = await web3.eth.getBlock(latest);
        if(block) {
          log.debug("Getting block from live stream poller", block.number);
          this.startBlock = latest;
          try {
            await this.handler(block);
          } catch (e) {
            log.error("Problem calling subscription handler", e);
          }
        }

      } finally {
        running = false;
      }
    }

    this.toID = setInterval(async ()=>{
      if(!running) {
        await poll()
      }
    }, POLL_PERIOD);
  }
}
