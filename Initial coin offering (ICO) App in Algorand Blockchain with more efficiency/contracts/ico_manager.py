from pyteal import *

KEY_STORAGE_CONTRACT_INDEX = Int(58778139)
KEY_ASSET_ID = Bytes("ID")
KEY_ASSET_BALANCE = Bytes("AB")
KEY_ASSET_PRICE = Bytes("AP")
KEY_START_TIMESTAMP = Bytes("ST")
KEY_END_TIMESTAMP = Bytes("ET")
KEY_ALGO_BALANCE = Bytes("AL")
KEY_IS_LIVE = Bytes("IL")

KEY_FLAG_SETUP = Bytes('SETUP')

def approval_program():
    
    read_key_asset_id = App.globalGet(KEY_ASSET_ID)
    read_key_asset_balance = App.globalGet(KEY_ASSET_BALANCE)
    read_key_asset_price= App.globalGet(KEY_ASSET_PRICE)
    read_key_start_time = App.globalGet(KEY_START_TIMESTAMP)
    read_key_end_time = App.globalGet(KEY_END_TIMESTAMP)
    read_key_algo_balance = App.globalGet(KEY_ALGO_BALANCE)

    def write_key_asset_balance(bal: Int): return App.globalPut(KEY_ASSET_BALANCE, bal)
    def write_key_algo_balance(bal: Int): return App.globalPut(KEY_ALGO_BALANCE, bal)
                           
    # Scratch Vars
    scratchvar_token_amount = ScratchVar(TealType.uint64)
    scratchvar_token_price = ScratchVar(TealType.uint64)
    scratchvar_total_value = ScratchVar(TealType.uint64)
    scratchvar_end_timestamp = ScratchVar(TealType.uint64)
    scratchvar_start_timestamp = ScratchVar(TealType.uint64) 

    def optin_to_token(tokenId): return Seq([
        InnerTxnBuilder.Begin(),
        InnerTxnBuilder.SetFields(
            {
                TxnField.type_enum: TxnType.AssetTransfer,
                TxnField.xfer_asset: tokenId,
                TxnField.asset_receiver: Global.current_application_address(),
                TxnField.asset_amount: Int(0),
            }
        ),
        InnerTxnBuilder.Submit(),
    ])
  
    def transfer_token(tokenId, tokenAmount, receiver): return Seq([
        InnerTxnBuilder.Begin(),
        InnerTxnBuilder.SetFields(
            {
                TxnField.type_enum: TxnType.AssetTransfer,
                TxnField.xfer_asset: tokenId,
                TxnField.asset_receiver: receiver,
                TxnField.asset_amount: tokenAmount,
            }
        ),
        InnerTxnBuilder.Submit(),
    ])

    def make_payment(amount): return Seq([
        InnerTxnBuilder.Begin(),
        InnerTxnBuilder.SetFields(
            {
                TxnField.type_enum: TxnType.Payment,
                TxnField.receiver: Txn.sender(),
                TxnField.amount: amount,
            }
        ),
        InnerTxnBuilder.Submit(),
    ])

    on_closeout = Int(1)

    on_delete = Int(1)

    on_update = Int(1)

    on_opt_in = Int(1)
    
    on_deploy = Int(1)

    on_setup = Seq([
        Assert(
            And(
                Gtxn[0].type_enum() == TxnType.Payment,
                Gtxn[0].amount() == Int(5000000),
                Gtxn[0].receiver() == Global.current_application_address(),

                Gtxn[1].type_enum() == TxnType.ApplicationCall,
                Gtxn[1].application_id() == Global.current_application_id(),
                Gtxn[1].assets.length() == Int(1),
                Gtxn[1].application_args.length() == Int(3),
                
                Gtxn[2].type_enum() == TxnType.AssetTransfer,
                Gtxn[2].asset_receiver() == Global.current_application_address(),
                Gtxn[2].asset_amount() > Int(0),
                Gtxn[2].xfer_asset() == Txn.assets[0],
                Gtxn[2].asset_sender() == Global.zero_address(),
                Gtxn[2].rekey_to() == Global.zero_address(),
                Gtxn[2].close_remainder_to() == Global.zero_address(),

                Gtxn[3].type_enum() == TxnType.ApplicationCall,
                Gtxn[3].application_id() == KEY_STORAGE_CONTRACT_INDEX,

                Gtxn[0].sender() == Gtxn[1].sender() == Gtxn[2].sender() == Global.creator_address(),

                App.globalGet(KEY_FLAG_SETUP) == Int(0),
                Btoi(Gtxn[1].application_args[1]) < Btoi(Gtxn[1].application_args[2]),
                Btoi(Gtxn[1].application_args[2]) > Global.latest_timestamp()
            )
        ),

        optin_to_token(Txn.assets[0]),
        App.globalPut(KEY_FLAG_SETUP, Int(1)),
        App.globalPut(KEY_ASSET_ID, Txn.assets[0]),
        write_key_asset_balance(Gtxn[2].asset_amount()),
        App.globalPut(KEY_ASSET_PRICE, Btoi(Gtxn[1].application_args[0])),
        App.globalPut(KEY_START_TIMESTAMP, Btoi(Gtxn[1].application_args[1])),
        App.globalPut(KEY_END_TIMESTAMP, Btoi(Gtxn[1].application_args[2])),
        App.globalPut(KEY_IS_LIVE, Int(1)),
        Int(1)
    ])    

    on_buy_token = Seq([
        scratchvar_token_amount.store(Btoi(Gtxn[0].application_args[0])),
        scratchvar_token_price.store(read_key_asset_price),
        scratchvar_total_value.store(scratchvar_token_amount.load() * scratchvar_token_price.load()),
        scratchvar_end_timestamp.store(read_key_end_time),
        scratchvar_start_timestamp.store(read_key_start_time),

        Assert(
            And(
                Gtxn[0].type_enum() == TxnType.ApplicationCall,
                Gtxn[0].assets.length() == Int(1),
                Gtxn[0].application_args.length() == Int(1),
                Txn.assets[0] == read_key_asset_id,

                Gtxn[1].type_enum() == TxnType.Payment,
                Gtxn[1].amount() == scratchvar_total_value.load(),
                Gtxn[1].receiver() == Global.current_application_address(),

                Gtxn[0].sender() == Gtxn[1].sender(),

                App.globalGet(KEY_FLAG_SETUP) == Int(1),
                scratchvar_token_amount.load() <= read_key_asset_balance,
                scratchvar_token_amount.load() > Int(0),
                scratchvar_end_timestamp.load() > Global.latest_timestamp() >= scratchvar_start_timestamp.load()
            )
        ),

        write_key_asset_balance(
            read_key_asset_balance - scratchvar_token_amount.load()
        ),

        write_key_algo_balance(
            read_key_algo_balance + Gtxn[1].amount()
        ),

        transfer_token(Txn.assets[0], scratchvar_token_amount.load(), Txn.sender()),
        Int(1)
    ])

    on_buy_token_with_optin = Seq([
        scratchvar_token_amount.store(Btoi(Gtxn[2].application_args[0])),
        scratchvar_token_price.store(read_key_asset_price),
        scratchvar_total_value.store(scratchvar_token_amount.load() * scratchvar_token_price.load()),
        scratchvar_end_timestamp.store(read_key_end_time),
        scratchvar_start_timestamp.store(read_key_start_time),

        Assert(
            And(

                Gtxn[0].type_enum() == TxnType.AssetTransfer,
                Gtxn[0].asset_receiver() == Gtxn[0].sender(),
                Gtxn[0].asset_amount() == Int(0),
                Gtxn[0].xfer_asset() == Txn.assets[0],
                Gtxn[0].asset_sender() == Global.zero_address(),
                Gtxn[0].rekey_to() == Global.zero_address(),
                Gtxn[0].close_remainder_to() == Global.zero_address(),

                Gtxn[1].type_enum() == TxnType.Payment,
                Gtxn[1].amount() == scratchvar_total_value.load(),
                Gtxn[1].receiver() == Global.current_application_address(),

                Gtxn[2].type_enum() == TxnType.ApplicationCall,
                Gtxn[2].assets.length() == Int(1),
                Gtxn[2].application_args.length() == Int(1),
                Txn.assets[0] == read_key_asset_id,

                Gtxn[0].sender() == Gtxn[1].sender() == Gtxn[2].sender(),

                App.globalGet(KEY_FLAG_SETUP) == Int(1),
                scratchvar_token_amount.load() <= read_key_asset_balance,
                scratchvar_token_amount.load() > Int(0),
                scratchvar_end_timestamp.load() > Global.latest_timestamp() >= scratchvar_start_timestamp.load()
            )
        ),

        write_key_asset_balance(
            read_key_asset_balance - scratchvar_token_amount.load()
        ),

        write_key_algo_balance(
            read_key_algo_balance + Gtxn[1].amount()
        ),

        transfer_token(Txn.assets[0], scratchvar_token_amount.load(), Txn.sender()),
        Int(1)
    ])

    on_end_ico = Seq([
        scratchvar_end_timestamp.store(read_key_end_time),
        Assert(
            And(
                Global.latest_timestamp() >= scratchvar_end_timestamp.load(),
                Txn.sender() == Global.creator_address(),
                Txn.assets[0] == read_key_asset_id
            )
        ),

        If(
            read_key_asset_balance > Int(0),
            Seq([
                transfer_token(Txn.assets[0], read_key_asset_balance, Txn.sender()),
                make_payment(read_key_algo_balance)
            ])
        ),

        App.globalPut(KEY_IS_LIVE, Int(0)),

        Int(1)
    ])

    program = Cond(
        [Txn.application_id() == Int(0),
            on_deploy],
        [Txn.on_completion() == OnComplete.CloseOut,
            on_closeout],
        [Txn.on_completion() == OnComplete.OptIn,
            on_opt_in],
        [Txn.on_completion() == OnComplete.DeleteApplication,
            on_delete],
        [Txn.on_completion() == OnComplete.UpdateApplication,
            on_update],
        [Global.group_size() == Int(4),
            on_setup],       
        [Global.group_size() == Int(3),
            on_buy_token_with_optin],    
        [Global.group_size() == Int(2),
            on_buy_token],
        [Global.group_size() == Int(1),
            on_end_ico],
                       
    )
    return program

def clear_program():
    return Int(1)

if __name__ == "__main__":
    state_manager_approve_teal_code = compileTeal(approval_program(), Mode.Application, version=5)
    with open('./contracts/manager_template_approve.teal', 'w') as f:
        f.write(state_manager_approve_teal_code)
    state_manager_clear_teal_code = compileTeal(clear_program(), Mode.Application, version=5)    
    with open('./contracts/manager_template_clear.teal', 'w') as f:
        f.write(state_manager_clear_teal_code)
