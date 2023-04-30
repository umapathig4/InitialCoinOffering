import './App.css';
import {Button, Container, Header, Message} from "semantic-ui-react";
import {useState, useCallback, useEffect} from "react";
import * as algosdk from 'algosdk';
import { Dimmer, Loader, Image, Segment } from 'semantic-ui-react'
import '../node_modules/bootstrap/dist/css/bootstrap.min.css';

async function connectAlgodClient(){
  let algodServer = `https://testnet-algorand.api.purestake.io/ps2`;
    let algodToken = {
      'X-API-Key': `Cg6qehffpc37kn9VLLf0eqjRK0R0WGt7giDFIfo5`
    };
  return new algosdk.Algodv2(algodToken, algodServer, '')
}

async function connectWallet(){
  if (typeof AlgoSigner !== 'undefined'){
    await AlgoSigner.connect({
      ledger: 'TestNet'
    });
    const accts = await AlgoSigner.accounts({
      ledger: 'TestNet'
    });
    return accts;
  }
}

async function readGlobalState(index){
  try {
    let res = []
    let algodClient = await connectAlgodClient();
    let response = await algodClient.getApplicationByID(index).do().catch(() => { return false})
    if(response && response['params']['global-state'])
       return response['params']['global-state']
    else
      return res[0] = `contract ${index} does not have global state`;
    }
    catch (err) {
    console.log("Error while reading global state: ", err)
  }
}

async function checkPending(algodClient, txid, numRoundTimeout) {
  if (algodClient == null || txid == null || numRoundTimeout < 0) {
    throw "Bad arguments.";
  }
  let status = (await algodClient.status().do());
  if (status == undefined) throw "Unable to get node status";

  let startingRound = status["last-round"];
  let nextRound = startingRound;
  let pendingInfo;
  while (nextRound < startingRound + numRoundTimeout) {
    pendingInfo = await algodClient.pendingTransactionInformation(txid).do();
    if (pendingInfo != undefined) {
      if (pendingInfo["confirmed-round"] !== null && pendingInfo["confirmed-round"] > 0) {
        return pendingInfo;
      }
      if (pendingInfo["pool-error"] != null && pendingInfo["pool-error"].length > 0) {
        return "Transaction Rejected";
      }
    }
    nextRound++;
    await algodClient.statusAfterBlock(nextRound).do();
  }

  if (pendingInfo != null) {
    return "Transaction Still Pending";
  }

  return null;
}

async function waitForConfirmation(algodClient, txId) {
  let cp = await checkPending(algodClient, txId, 4);
  if (cp == null || cp == "Transaction Rjected") throw new Error("Transaction Rejected");
  if (cp == "Transaction Still Pending") throw new Error("Transaction Still Pending");
  return cp["confirmed-round"];
};  

async function ItoB(x) {
  var bytes = [];
  var i = 8;
  do {
    bytes[--i] = x & (255);
    x = x >> 8;
  } while (i)
  return new Uint8Array(Buffer.from(bytes));
}

function constructApplTxn(from, appAccts, appArgs, params, appApp, appAssets) {
  return {
    type: "appl",
    from: from,
    appIndex: undefined,
    appAccounts: appAccts,
    appArgs: appArgs,
    appOnComplete: 0,
    suggestedParams: params,
    appForeignAssets: appAssets,
    appForeignApps: appApp,
  }
}

function constructPaymentTxn(from, amount, to, params){
  return {
    type: 'pay',
    from: from,
    amount: amount,
    to: to,
    suggestedParams: params
  };
}

function constructAxferTx(qty, sender, receiver, params, note, index) {
  return {
    type: 'axfer',
    from: sender,
    to: receiver,
    assetIndex: index,
    amount: qty,
    note: note,
    group: undefined,
    suggestedParams: params
  }
}

async function compileAppProgram(client, programSource) {
  let encoder = new TextEncoder();
  let programBytes = encoder.encode(programSource);
  let compileResponse = await client.compile(programBytes).do();
  let compiledBytes = new Uint8Array(Buffer.from(compileResponse.result, "base64"));
  return compiledBytes;
}

function base64ToByteArray(blob) {
  return stringToByteArray(window.atob(blob));
}

function stringToByteArray(str) {
  return new Uint8Array(str.split('').map((x) => x.charCodeAt(0)));
}

async function signWithAlgoSigner(transactionArr, nonSigners = []){
  return new Promise(async (resolve, reject) => {
    await window.AlgoSigner.connect()
    let arrayTosign = new Array();
    for (let i = 0; i < transactionArr.length; i++) {
      let binTx = transactionArr[i].toByte();
      let base64TxLocal = window.AlgoSigner.encoding.msgpackToBase64(binTx);
      if (nonSigners.includes(i))
        arrayTosign[i] = { txn: base64TxLocal, signers: [] }
      else
        arrayTosign[i] = { txn: base64TxLocal }
    }
    try {
      let signed = await window.AlgoSigner.signTxn(arrayTosign)
      resolve(signed)
    } catch (error) {
      console.log(error)
      reject(error)
    }
  })
}

async function signGroupAlgosigner(txns, nonSigners = []) {
  try {
    let signed = [];
    let signedTxns = await signWithAlgoSigner(txns, nonSigners)
    for (let i = 0; i < txns.length; i++) {
      if (!nonSigners.includes(i))
        signed.push(await base64ToByteArray(signedTxns[i].blob));
    }
    return signed;

  } catch (err) {
    console.log("Error during signing grp txn: ", err)
    throw err
  }
}

async function getApps(){
  const storage_contract_id = 58778139
  let res = await readGlobalState(storage_contract_id)
  let appArray = []
  if(res){
    for(let i=0; i<res.length; i++){
      let key = window.atob(res[i]['key'])
      if(key != 'C')
        appArray.push(res[i]['value']['uint']) 
    }
  }
  return appArray
}

const isFinished = (end) => {
  let dateNow = ((new Date()).getTime()) / 10**3
  if(end <= dateNow)
     return true
  else
     return false   
}

async function getAppCreator(appIndex){
  let algodClient = await connectAlgodClient()
  let info = await algodClient.getApplicationByID(appIndex).do()
  return info['params']['creator']
}

async function getOngoingICOs(){
  let accounts = await connectWallet()
  let account = accounts[0].address
  let appInfo = []
  let apps = await getApps()
  for(let i =0; i<apps.length; i++){
    let index, price, balance, endTimestamp;
    let state = await readGlobalState(apps[i])
    if(state){
      let creator = await getAppCreator(apps[i])
    for(let j=0; j<state.length; j++){
      let key = window.atob(state[j]['key'])
      let value = state[j]['value']['uint']
      if(key == 'ID')
         index = value
      else if(key == 'AB')   
         balance = value
      else if(key == 'AP')
         price = value
      else if(key == 'ET')
         endTimestamp = value      
    }

    let obj = {
        appIndex : apps[i],
        assetIndex : index,
        price : price,
        balance : balance/10**6,
        endTimestamp : endTimestamp,
        creator: creator,
        canEnd: undefined,
        myAccount: account
      }

      let mine = isMine(account, obj); let canEnd = false
      if(mine && isFinished(endTimestamp))
        canEnd = true
      obj.canEnd = canEnd

      appInfo.push(obj)
    }
    
  }
  return appInfo
}

async function updateICOList(){
  let icos = await getOngoingICOs()
  return icos
}

async function checkAssetOptin(account, assetId, algodClient){
  let accountInfo = await algodClient.accountInformation(account).do();
  for (let idx = 0; idx < accountInfo['assets'].length; idx++) {
    let scrutinizedAsset = accountInfo['assets'][idx];
    if (scrutinizedAsset['asset-id'] == assetId) {
      return true
    }
  }
}

async function buyToken(ico){
  // e.preventDefault()
  // let tokenAmount = e.target.elements[0].value
  let tokenAmount = parseFloat(document.getElementById(ico.appIndex).value);
  console.log(tokenAmount)
  tokenAmount = (tokenAmount * 10**6)
  let accounts = await connectWallet()
  const account = accounts[0].address;
  const algodClient = await connectAlgodClient();
  const params = await algodClient.getTransactionParams().do();
  let checkOptin = await checkAssetOptin(account, ico.assetIndex, algodClient)
  console.log(checkOptin)
  let assetIndex = ico.assetIndex
  let appIndex = ico.appIndex
  let price = ico.price
  let appArgs = [];
  appArgs.push(await ItoB(tokenAmount));
  let assets = [ assetIndex ]
  let managerAppAddress = algosdk.getApplicationAddress(appIndex)
  let algoAmount = (tokenAmount * price) 

  let applTx = constructApplTxn(account, undefined, appArgs, params, undefined, assets);
  let payTx = constructPaymentTxn(account, algoAmount, managerAppAddress, params);
  let axferTx = constructAxferTx(0, account, account, params, undefined, ico.assetIndex)
  let txns;

  if(checkOptin){
    let transaction1 = {
      ...applTx,
      ...params,
      appIndex: appIndex,
      appArgs: appArgs,
      foreignAssets: assets
    };
  
    let transaction2 = {
      ...payTx,
      ...params,
    };
  
    transaction1 = algosdk.makeApplicationNoOpTxnFromObject(transaction1);
    transaction2 = algosdk.makePaymentTxnWithSuggestedParamsFromObject(transaction2);
  
    txns = [transaction1, transaction2];
  
    let groupTxnId = algosdk.assignGroupID(txns);
    transaction1.group = groupTxnId[0].group;
    transaction2.group = groupTxnId[1].group;
  }

  else{

    let transaction1 = {
      ...axferTx,
      ...params,
    }
  
    let transaction2 = {
      ...payTx,
      ...params,
    };

    let transaction3 = {
      ...applTx,
      ...params,
      appIndex: appIndex,
      appArgs: appArgs,
      foreignAssets: assets
    };
    
    transaction1 = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject(transaction1);
    transaction2 = algosdk.makePaymentTxnWithSuggestedParamsFromObject(transaction2);
    transaction3 = algosdk.makeApplicationNoOpTxnFromObject(transaction3);
    
    
    txns = [transaction1, transaction2, transaction3];
  
    let groupTxnId = algosdk.assignGroupID(txns);
    transaction1.group = groupTxnId[0].group;
    transaction2.group = groupTxnId[1].group;
    transaction3.group = groupTxnId[2].group;
  }

  let signedGrp = await signGroupAlgosigner(txns, []);
  let tx = await algodClient.sendRawTransaction(signedGrp).do()
  await waitForConfirmation(algodClient, tx.txId)
  console.log(tx)
  
}

async function endIco(e, ico){
  try{
    e.preventDefault();
    let accounts = await connectWallet()
    const account = accounts[0].address;
    const algodClient = await connectAlgodClient();
    const params = await algodClient.getTransactionParams().do();
    let assetIndex = ico.assetIndex
    let appIndex = ico.appIndex
    let assets = [ assetIndex ]

    let applTx = constructApplTxn(account, undefined, undefined, params, undefined, assets);

    let transaction1 = {
      ...applTx,
      ...params,
      appIndex: appIndex,
      foreignAssets: assets
    };

    transaction1 = algosdk.makeApplicationNoOpTxnFromObject(transaction1);

    let signed = await signWithAlgoSigner([transaction1]) 
    let txn = await algodClient.sendRawTransaction(window.AlgoSigner.encoding.base64ToMsgpack(signed[0].blob)).do()
    await waitForConfirmation(algodClient, txn)
    console.log(txn)
  }catch(err){
    console.log(err)
  }
}

function isNotMineAndisNotOver(ico){
  if(!(ico.myAccount === ico.creator) && !isFinished(ico.endTimestamp))
    return true
  else
    return false
}

function isMine(ico){
  if(ico.myAccount === ico.creator)
    return true
  else
    return false

}

const TableTemplate = ({title, buttonText, buttonAction}) => {
  const [results, setResult] = useState(undefined);
  const [isLoading, setLoading] = useState(false);

  const onClick = useCallback(async () => {
    setLoading(true)
    const results = await buttonAction();
    setResult(results);
    setLoading(false)
  }, [buttonAction]);

  return (
    <>
    { isLoading && <div className='Loader'>
             <Dimmer active inverted size='massive'>
                <Loader inverted>Loading</Loader>
             </Dimmer>
          </div> } 
      <Header as="h2" dividing>{title}</Header>
      <Button primary={true} onClick={onClick}>{buttonText}</Button>
      <br/>
      { results != undefined && <div className="row">
        <div className="col-sm-12">
          <table className="table">
            <thead>
              <tr>
                <th>Asset Id</th>
                <th>Price</th>
                <th>Balance</th>
                <th>End Timestamp</th>
                <th>Purchase Amount</th>
              </tr>
            </thead>
            <tbody>
              {results.map(result => (
                <tr key={result.appIndex}>
                  <td>{result.assetIndex}</td>
                  <td>{result.price}</td>
                  <td>{result.balance}</td>
                  <td>{result.endTimestamp}</td>
                  <td>
                    { isNotMineAndisNotOver(result) ? <input type="text" id = {result.appIndex} autoComplete='off'/> : (<p> Cannot buy from own ICO </p>) }  
                  </td>
                  <td>
                   { isNotMineAndisNotOver(result) ? <button 
                          onClick={ () =>  buyToken(result)}
                          className="btn btn-primary" placeholder='enter amount' disabled={result.balance <= 0}>
                          BUY
                        </button> : isMine(result) ? 
                        <form onSubmit={e => endIco(e, result)}>
                        <button 
                          type="submit" 
                          className="btn btn-primary" disabled={!result.canEnd}>
                          END ICO
                        </button>
                      </form> : (<></>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <hr/>
      </div>}
    </>
  );
};

const LoadICOs = () => {
  const action = useCallback(async () => {
    let icos = await updateICOList()
    return icos
  }, []);
  return(
    <TableTemplate title="" buttonText="Refresh ICOs list" buttonAction={action}/>
  )
}

function App() {
  const [accounts, setAccounts] = useState(undefined);
  const [isLoading, setLoading] = useState(false);
  const storage_contract_id = 58778139

  async function connectWallet(){
    if (typeof AlgoSigner !== 'undefined'){
      await AlgoSigner.connect({
        ledger: 'TestNet'
      });
      const accts = await AlgoSigner.accounts({
        ledger: 'TestNet'
      });
      setAccounts(accts)
      return accts;
    }
  }

  function getApprovalProgram(){
    return `#pragma version 5
    txn ApplicationID
    int 0
    ==
    bnz main_l20
    txn OnCompletion
    int CloseOut
    ==
    bnz main_l19
    txn OnCompletion
    int OptIn
    ==
    bnz main_l18
    txn OnCompletion
    int DeleteApplication
    ==
    bnz main_l17
    txn OnCompletion
    int UpdateApplication
    ==
    bnz main_l16
    global GroupSize
    int 4
    ==
    bnz main_l15
    global GroupSize
    int 3
    ==
    bnz main_l14
    global GroupSize
    int 2
    ==
    bnz main_l13
    global GroupSize
    int 1
    ==
    bnz main_l10
    err
    main_l10:
    byte "ET"
    app_global_get
    store 3
    global LatestTimestamp
    load 3
    >=
    txn Sender
    global CreatorAddress
    ==
    &&
    txna Assets 0
    byte "ID"
    app_global_get
    ==
    &&
    assert
    byte "AB"
    app_global_get
    int 0
    >
    bnz main_l12
    main_l11:
    byte "IL"
    int 0
    app_global_put
    int 1
    b main_l21
    main_l12:
    itxn_begin
    int axfer
    itxn_field TypeEnum
    txna Assets 0
    itxn_field XferAsset
    txn Sender
    itxn_field AssetReceiver
    byte "AB"
    app_global_get
    itxn_field AssetAmount
    itxn_submit
    itxn_begin
    int pay
    itxn_field TypeEnum
    txn Sender
    itxn_field Receiver
    byte "AL"
    app_global_get
    itxn_field Amount
    itxn_submit
    b main_l11
    main_l13:
    gtxna 0 ApplicationArgs 0
    btoi
    store 0
    byte "AP"
    app_global_get
    store 1
    load 0
    load 1
    *
    store 2
    byte "ET"
    app_global_get
    store 3
    byte "ST"
    app_global_get
    store 4
    gtxn 0 TypeEnum
    int appl
    ==
    gtxn 0 NumAssets
    int 1
    ==
    &&
    gtxn 0 NumAppArgs
    int 1
    ==
    &&
    txna Assets 0
    byte "ID"
    app_global_get
    ==
    &&
    gtxn 1 TypeEnum
    int pay
    ==
    &&
    gtxn 1 Amount
    load 2
    ==
    &&
    gtxn 1 Receiver
    global CurrentApplicationAddress
    ==
    &&
    gtxn 0 Sender
    gtxn 1 Sender
    ==
    &&
    byte "SETUP"
    app_global_get
    int 1
    ==
    &&
    load 0
    byte "AB"
    app_global_get
    <=
    &&
    load 0
    int 0
    >
    &&
    global LatestTimestamp
    load 4
    >=
    &&
    assert
    byte "AB"
    byte "AB"
    app_global_get
    load 0
    -
    app_global_put
    byte "AL"
    byte "AL"
    app_global_get
    gtxn 1 Amount
    +
    app_global_put
    itxn_begin
    int axfer
    itxn_field TypeEnum
    txna Assets 0
    itxn_field XferAsset
    txn Sender
    itxn_field AssetReceiver
    load 0
    itxn_field AssetAmount
    itxn_submit
    int 1
    b main_l21
    main_l14:
    gtxna 2 ApplicationArgs 0
    btoi
    store 0
    byte "AP"
    app_global_get
    store 1
    load 0
    load 1
    *
    store 2
    byte "ET"
    app_global_get
    store 3
    byte "ST"
    app_global_get
    store 4
    gtxn 0 TypeEnum
    int axfer
    ==
    gtxn 0 AssetReceiver
    gtxn 0 Sender
    ==
    &&
    gtxn 0 AssetAmount
    int 0
    ==
    &&
    gtxn 0 XferAsset
    txna Assets 0
    ==
    &&
    gtxn 0 AssetSender
    global ZeroAddress
    ==
    &&
    gtxn 0 RekeyTo
    global ZeroAddress
    ==
    &&
    gtxn 0 CloseRemainderTo
    global ZeroAddress
    ==
    &&
    gtxn 1 TypeEnum
    int pay
    ==
    &&
    gtxn 1 Amount
    load 2
    ==
    &&
    gtxn 1 Receiver
    global CurrentApplicationAddress
    ==
    &&
    gtxn 2 TypeEnum
    int appl
    ==
    &&
    gtxn 2 NumAssets
    int 1
    ==
    &&
    gtxn 2 NumAppArgs
    int 1
    ==
    &&
    txna Assets 0
    byte "ID"
    app_global_get
    ==
    &&
    gtxn 1 Sender
    gtxn 2 Sender
    ==
    &&
    byte "SETUP"
    app_global_get
    int 1
    ==
    &&
    load 0
    byte "AB"
    app_global_get
    <=
    &&
    load 0
    int 0
    >
    &&
    global LatestTimestamp
    load 4
    >=
    &&
    assert
    byte "AB"
    byte "AB"
    app_global_get
    load 0
    -
    app_global_put
    byte "AL"
    byte "AL"
    app_global_get
    gtxn 1 Amount
    +
    app_global_put
    itxn_begin
    int axfer
    itxn_field TypeEnum
    txna Assets 0
    itxn_field XferAsset
    txn Sender
    itxn_field AssetReceiver
    load 0
    itxn_field AssetAmount
    itxn_submit
    int 1
    b main_l21
    main_l15:
    gtxn 0 TypeEnum
    int pay
    ==
    gtxn 0 Amount
    int 5000000
    ==
    &&
    gtxn 0 Receiver
    global CurrentApplicationAddress
    ==
    &&
    gtxn 1 TypeEnum
    int appl
    ==
    &&
    gtxn 1 ApplicationID
    global CurrentApplicationID
    ==
    &&
    gtxn 1 NumAssets
    int 1
    ==
    &&
    gtxn 1 NumAppArgs
    int 3
    ==
    &&
    gtxn 2 TypeEnum
    int axfer
    ==
    &&
    gtxn 2 AssetReceiver
    global CurrentApplicationAddress
    ==
    &&
    gtxn 2 AssetAmount
    int 0
    >
    &&
    gtxn 2 XferAsset
    txna Assets 0
    ==
    &&
    gtxn 2 AssetSender
    global ZeroAddress
    ==
    &&
    gtxn 2 RekeyTo
    global ZeroAddress
    ==
    &&
    gtxn 2 CloseRemainderTo
    global ZeroAddress
    ==
    &&
    gtxn 3 TypeEnum
    int appl
    ==
    &&
    gtxn 3 ApplicationID
    int 58778139
    ==
    &&
    gtxn 2 Sender
    global CreatorAddress
    ==
    &&
    byte "SETUP"
    app_global_get
    int 0
    ==
    &&
    gtxna 1 ApplicationArgs 1
    btoi
    gtxna 1 ApplicationArgs 2
    btoi
    <
    &&
    gtxna 1 ApplicationArgs 2
    btoi
    global LatestTimestamp
    >
    &&
    assert
    itxn_begin
    int axfer
    itxn_field TypeEnum
    txna Assets 0
    itxn_field XferAsset
    global CurrentApplicationAddress
    itxn_field AssetReceiver
    int 0
    itxn_field AssetAmount
    itxn_submit
    byte "SETUP"
    int 1
    app_global_put
    byte "ID"
    txna Assets 0
    app_global_put
    byte "AB"
    gtxn 2 AssetAmount
    app_global_put
    byte "AP"
    gtxna 1 ApplicationArgs 0
    btoi
    app_global_put
    byte "ST"
    gtxna 1 ApplicationArgs 1
    btoi
    app_global_put
    byte "ET"
    gtxna 1 ApplicationArgs 2
    btoi
    app_global_put
    byte "IL"
    int 1
    app_global_put
    int 1
    b main_l21
    main_l16:
    int 1
    b main_l21
    main_l17:
    int 1
    b main_l21
    main_l18:
    int 1
    b main_l21
    main_l19:
    int 1
    b main_l21
    main_l20:
    int 1
    main_l21:
    return`
  }

  function getClearProgram(){
    return `#pragma version 5
    int 1
    return`
  }

  async function createToken(e) {
    try{
      e.preventDefault();
      setLoading(true)
      let accounts = await connectWallet()
      const account = accounts[0].address
      const name = e.target.elements[0].value;
      const symbol = e.target.elements[1].value;
      const supply = Number(e.target.elements[2].value) * 10**6
      const decimals = 6
      const algodClient = await connectAlgodClient();
      const params = await algodClient.getTransactionParams().do();
      let txObj = algosdk.makeAssetCreateTxnWithSuggestedParams(account, undefined, supply, decimals, false, account,
                                account, account, account, symbol, name, undefined, undefined, params)

      let signed = await signWithAlgoSigner([txObj]) 
      let txn = await algodClient.sendRawTransaction(window.AlgoSigner.encoding.base64ToMsgpack(signed[0].blob)).do()
      await waitForConfirmation(algodClient, txn)
      console.log(txn)
      setLoading(false)
    } catch (error) {
        console.log(error)
        setLoading(false)
      }           
  }

  async function intitiateICO(e){
    try{
      e.preventDefault()
      setLoading(true)
      let accounts = await connectWallet()
      const account = accounts[0].address;
      const algodClient = await connectAlgodClient();
      const params = await algodClient.getTransactionParams().do();
      let approvalProgram = getApprovalProgram()
      let clearProgram = getClearProgram()
      let approvalProgramBytes = await compileAppProgram(algodClient, approvalProgram)
      let clearProgramBytes = await compileAppProgram(algodClient, clearProgram)
      let txObj = algosdk.makeApplicationCreateTxn(account, params, 0, approvalProgramBytes, clearProgramBytes, 0, 0, 32, 0);
      let signed = await signWithAlgoSigner([txObj])
      let txn = await algodClient.sendRawTransaction(window.AlgoSigner.encoding.base64ToMsgpack(signed[0].blob)).do()
      console.log(txn) 
      await waitForConfirmation(algodClient, txn.txId)
      let transactionResponse = await algodClient.pendingTransactionInformation(txn.txId).do();
      let appId = transactionResponse['application-index'];
      const assetId = Number(e.target.elements[0].value)
      const amount = Number(e.target.elements[1].value) * 10**6
      const price = Number(e.target.elements[2].value)
      const start = ((new Date(e.target.elements[3].value)).getTime()) / 10**3
      const end = ((new Date(e.target.elements[4].value)).getTime()) / 10**3

      if(end < start){
        alert('End date should be greater than start date')
        return
      }

      let appArgs = [];
      appArgs.push(await ItoB(price));
      appArgs.push(await ItoB(start));
      appArgs.push(await ItoB(end));

      let assets = [ assetId ]
      let managerAppAddress = algosdk.getApplicationAddress(appId)

      let payTx = constructPaymentTxn(account, 5000000, managerAppAddress, params);
      let applTx = constructApplTxn(account, undefined, appArgs, params, undefined, assets);
      let axferTx = constructAxferTx(amount, account, managerAppAddress, params, undefined, assetId)
      
      let transaction1 = {
        ...payTx,
        ...params,
      };

      let transaction2 = {
        ...applTx,
        ...params,
        appIndex: appId,
        appArgs: appArgs,
        foreignAssets: assets
      };

      let transaction3 = {
        ...axferTx,
        ...params,
      };

      let transaction4 = {
        ...applTx,
        ...params,
        appIndex: storage_contract_id,
      };

      transaction1 = algosdk.makePaymentTxnWithSuggestedParamsFromObject(transaction1);
      transaction2 = algosdk.makeApplicationNoOpTxnFromObject(transaction2);
      transaction3 = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject(transaction3);
      transaction4 = algosdk.makeApplicationNoOpTxnFromObject(transaction4);
      
      let txns = [transaction1, transaction2, transaction3, transaction4];

      let groupTxnId = algosdk.assignGroupID(txns);
      transaction1.group = groupTxnId[0].group;
      transaction2.group = groupTxnId[1].group;
      transaction3.group = groupTxnId[2].group;
      transaction4.group = groupTxnId[3].group;

      let signedGrp = await signGroupAlgosigner(txns, []);
      let tx2 = await algodClient.sendRawTransaction(signedGrp).do()
      await waitForConfirmation(algodClient, tx2.txId)
      console.log(tx2)
      setLoading(false)

    } catch (error) {
        console.log(error)
        setLoading(false)
      } 
  }

  return (
    <Container className="App">
      <div className='corner'> <Button primary={true} onClick={connectWallet}>Connect Wallet</Button> </div> <br/>
      { isLoading && <div className='Loader'>
             <Dimmer active inverted size='massive'>
                <Loader inverted>Loading</Loader>
             </Dimmer>
          </div> } 
        <Header as="h1" dividing>Initial Coin Offering - Algorand </Header>
        <p>
          <center> Create your own Algorand Standard Asset and hold an Initial Coin Offering ! </center>
        </p> <hr/>

        <div className="row">
        <h1>Create new token (ASA) </h1> <br/> <hr/>
          <div className="col-sm-4">
            <form onSubmit={e => createToken(e)}>
              <div className="form-group">
                <label htmlFor="tokenName">Token Name</label> <span></span>
                <input type="text" className="form-control" id="tokenName" autoComplete='off' />
              </div>
              <br/>
              <div className="form-group">
                <label htmlFor="tokenSymbol"> Token Symbol </label> <span></span>
                <input type="text" className="form-control" id="tokenSymbol" autoComplete='off'/>
              </div> 
              <br/>
              <div className="form-group"> 
                <label htmlFor="tokenSupply"> Total Supply </label> <span></span>
                <input type="number" className="form-control" id="tokenSupply" autoComplete='off' />
              </div>
              <br/>
              <button className='btn btn-primary' type="submit">Submit</button>
            </form>
          </div>
        </div>
        <hr/>
        <br/> <br/>

        <div className="row">
        <h1>Setup ICO </h1> <br/> <hr/>
          <div className="col-sm-4">
            <form onSubmit={e => intitiateICO(e)}>
              <div className="form-group">
                <label htmlFor="tokenID">Token ID</label> <span></span>
                <input type="text" className="form-control" id="tokenID" autoComplete='off'/>
              </div>
              <br/>
              <div className="form-group"> 
                <label htmlFor="tokenAmount"> Total Amount </label> <span></span>
                <input type="number" className="form-control" id="tokenAmount" autoComplete='off'/>
              </div>
              <br/>
              <div className="form-group"> 
                <label htmlFor="tokenPrice"> Token Price </label> <span></span>
                <input type="number" className="form-control" id="tokenPrice" autoComplete='off'/>
              </div>
              <br/>
              <div className="form-group"> 
                <label htmlFor="startDate"> Start Date </label> <span></span>
                <input type="date" className="form-control" id="startDate" autoComplete='off'/>
              </div>
              <br/>
              <div className="form-group"> 
                <label htmlFor="endDate"> End Date </label> <span></span>
                <input type="date" className="form-control" id="endDate" autoComplete='off'/>
              </div>
              <br/>
              <button className='btn btn-primary' type="submit" >Initiate ICO</button>
            </form>
          </div>
        </div>
        <hr/>
        <br/> <br/>
        <div className="row">
          <div className="col-sm-4">
            <h1>Subscribe to ICOs</h1> 
          </div>
        </div>
        <LoadICOs/>
        <br/><br/><br/><br/>
    </Container>
    
  );
}

export default App;
