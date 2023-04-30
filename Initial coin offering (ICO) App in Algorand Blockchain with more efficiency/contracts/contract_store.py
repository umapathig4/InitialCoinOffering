from pyteal import *

KEY_TOTAL_APP_COUNT = Bytes('C')

def approval_program():

    read_app_count = App.globalGet(KEY_TOTAL_APP_COUNT)

    on_closeout = Int(1)

    on_delete = Int(1)

    on_opt_in = Int(1)
    
    on_deploy = Seq([
        App.globalPut(KEY_TOTAL_APP_COUNT, Int(0)),
        Int(1)
    ])

    on_setup = Seq([

        Assert(
            And(
                Gtxn[0].type_enum() == TxnType.Payment,
                Gtxn[0].amount() == Int(5000000),

                Gtxn[1].type_enum() == TxnType.ApplicationCall,
                Gtxn[1].assets.length() == Int(1),
                Gtxn[1].application_args.length() == Int(3),
                
                Gtxn[2].type_enum() == TxnType.AssetTransfer,

                Gtxn[3].type_enum() == TxnType.ApplicationCall,
                Gtxn[3].application_id() == Global.current_application_id(),
            )
        ),

        App.globalPut(Itob(read_app_count), Gtxn[1].application_id()),
        App.globalPut(KEY_TOTAL_APP_COUNT, read_app_count + Int(1)),
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
        [Global.group_size() == Int(4),
            on_setup],    
                       
    )
    return program

def clear_program():
    return Int(1)

if __name__ == "__main__":
    state_manager_approve_teal_code = compileTeal(approval_program(), Mode.Application, version=5)
    with open('./contracts/contract_store_approval.teal', 'w') as f:
        f.write(state_manager_approve_teal_code)
    state_manager_clear_teal_code = compileTeal(clear_program(), Mode.Application, version=5)    
    with open('./contracts/contract_store_clear.teal', 'w') as f:
        f.write(state_manager_clear_teal_code)
