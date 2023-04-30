// const appId = 13793863;

// const ExampleAlgoSigner = ({title, buttonText, buttonAction}) => {
//   const [result, setResult] = useState("");

//   const onClick = useCallback(async () => {
//     const r = await buttonAction();
//     setResult(r);
//   }, [buttonAction]);

//   return (
//     <>
//       <Header as="h2" dividing>{title}</Header>
//       <Button primary={true} onClick={onClick}>{buttonText}</Button>
//       <Message>
//         <code>
//           {result}
//         </code>
//       </Message>
//     </>
//   );
// };

// const OnlyButton = ({title, buttonText, buttonAction}) => {
//   const [result, setResult] = useState("");

//   const onClick = useCallback(async () => {
//     const r = await buttonAction();
//     setResult(r);
//   }, [buttonAction]);

//   return (
//     <>
//       <Button primary={true} onClick={onClick}>{buttonText}</Button>
//     </>
//   );
// };

// const CheckAlgoSigner = () => {
//   const action = useCallback(() => {
//     if (typeof AlgoSigner !== 'undefined') {
//       return "AlgoSigner is installed.";
//     } else {
//       return "AlgoSigner is NOT installed.";
//     }
//   }, []);

//   return <ExampleAlgoSigner title="CheckAlgoSigner" buttonText="Check" buttonAction={action}/>
// };

// async function algosignerAccounts() {
//   if (typeof AlgoSigner !== 'undefined'){
//     await AlgoSigner.connect({
//       ledger: 'TestNet'
//     });
//     const accts = await AlgoSigner.accounts({
//       ledger: 'TestNet'
//     });
//     return accts;
//   }
// }

// const GetAccounts = () => {
//   const action = useCallback(async () => {
//     if (typeof AlgoSigner !== 'undefined'){
//       await AlgoSigner.connect({
//         ledger: 'TestNet'
//       });
//       const accts = await AlgoSigner.accounts({
//         ledger: 'TestNet'
//       });
//       return JSON.stringify(accts, null, 2);
//     }
//     else{
//       alert("AlgoSigner is NOT installed.");
//     }
    
//   }, []);

//   // return <OnlyButton title="Get Accounts" buttonText="Connect wallet" buttonAction={action}/>
//   return(
//     <Button primary={true} onClick={action}>Connect Wallet</Button>
//   )
// };

// const GetParams = () => {
//   const action = useCallback(async () => {
//     try {
//       const r = await AlgoSigner.algod({
//         ledger: 'TestNet',
//         path: `/v2/transactions/params`
//       });
//       return JSON.stringify(r, null, 2);
//     } catch (e) {
//       console.error(e);
//       return JSON.stringify(e, null, 2);
//     }
//   }, []);

//   const createToken = (e) => {
//     e.preventDefault();
//     const name = e.target.elements[0].value;
//     console.log(name)
//   } 

//   // return <ExampleAlgoSigner title="Get Transaction Params" buttonText="Get Transaction Params" buttonAction={action}/>
//   return (
//     <div className="container">
//       <div className="row">
//           <div className="col-sm-12">
//             <h2>Create new token (ASA) </h2>
//             <form onSubmit={e => createToken(e)}>
//               <div className="form-group">
//                 <label htmlFor="tokenName">Token Name</label> <span></span>
//                 <input type="text" className="form-control" id="tokenName" />
//               </div>
//               <br/>
//               <div className="form-group">
//                 <label htmlFor="tokenSymbol">Token Symbol</label> <span></span>
//                 <input type="text" className="form-control" id="tokenSymbol" />
//               </div> 
//               <br/>
//               <div className="form-group"> 
//                 <label htmlFor="tokenSupply"> Total Supply </label> <span></span>
//                 <input type="number" className="form-control" id="tokenSupply" />
//               </div>
//               <br/>
//               <div className="form-group"> 
//                 <label htmlFor="tokenDecimals"> Token Decimals </label> <span></span>
//                 <input type="number" className="form-control" id="tokenDecimals" />
//               </div>
//               <br/>
//               <button  className='btn btn-primary' type="submit">Submit</button>
//               {/* <Button primary={true} onClick={onClick}>{buttonText}</Button> */}
//             </form>
//           </div>
//         </div>
//     </div>
//   )
// };


// const GetAppGlobalState = () => {
//   const action = useCallback(async () => {
//     try {
//       const r = await AlgoSigner.indexer({
//         ledger: 'TestNet',
//         path: `/v2/applications/${appId}`
//       });
//       return JSON.stringify(r, null, 2);
//     } catch (e) {
//       console.error(e);
//       return JSON.stringify(e, null, 2);
//     }
//   }, []);

//   return <ExampleAlgoSigner title="Get Global State" buttonText="Get Global State" buttonAction={action}/>
// };

// async function App() {
//   const [accounts, setAccounts] = useState("");
//   let c = await algosignerAccounts()
//   console.log(c)
//   return (
//     <Container className="App">
//       <div className='corner'> <GetAccounts/> </div> <br/>
//       <Header as="h1" dividing>Initial Coin Offering - Algorand </Header>
//       <p>
//         Create your own Algorand Standard Asset and hold an Initial Coin Offering !
//       </p>

      

//       <GetParams/>

//       <GetAppGlobalState/>

//     </Container>
//   );
// };

// export default App;