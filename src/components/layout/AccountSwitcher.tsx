import { useEffect, useState } from 'react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ChevronsUpDown, Plus } from 'lucide-react';
interface Account {
    id: number;
    username: string;
    profile_picture_url: string;
    instagram_business_id: string;
    is_active: number;
}

interface AccountSwitcherProps {
    onNavigate: (page: string) => void;
    collapsed?: boolean;
}

export function AccountSwitcher({ onNavigate }: AccountSwitcherProps) {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [activeAccountId, setActiveAccountId] = useState<number | null>(null);

    useEffect(() => {
        loadAccounts();
    }, []);

    const loadAccounts = async () => {
        try {
            // @ts-ignore
            const result = await window.ipcRenderer.invoke('get-accounts');
            if (result.success) {
                setAccounts(result.data);
                setActiveAccountId(result.activeId);
            }
        } catch (error) {
            console.error("Failed to load accounts", error);
        }
    };

    const handleSwitch = async (accountId: number) => {
        try {
            // @ts-ignore
            await window.ipcRenderer.invoke('switch-active-account', accountId);
            setActiveAccountId(accountId);
            // Trigger app reload to refresh data for new account
            window.location.reload();
        } catch (error) {
            console.error(error);
        }
    };

    const handleAddAccount = () => {
        onNavigate('connect-social');
    };

    const activeAccount = accounts.find(a => a.id === activeAccountId) || null;

    if (!activeAccount && accounts.length === 0) {
        // No accounts connected state
        return (
            <div className="mx-4 mb-4 p-3 rounded-xl bg-gray-50 dark:bg-zinc-900 border border-dashed border-gray-200 dark:border-zinc-700 flex flex-col gap-2">
                <p className="text-xs text-center text-gray-500">No account connected</p>
                <button
                    onClick={handleAddAccount}
                    className="w-full py-1.5 text-xs bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
                >
                    Connect Account
                </button>
            </div>
        );
    }

    return (
        <div className="mx-4 mb-2">
            <DropdownMenu>
                <DropdownMenuTrigger className="w-full rounded-xl hover:bg-gray-100 dark:hover:bg-zinc-800 p-2 outline-none transition-colors border border-transparent hover:border-gray-200 dark:hover:border-zinc-700">
                    <div className="flex items-center gap-3">
                        <Avatar className="w-9 h-9 rounded-lg border border-gray-200 dark:border-zinc-700">
                            <AvatarImage src={activeAccount?.profile_picture_url || ''} />
                            <AvatarFallback className="rounded-lg bg-indigo-100 text-indigo-600 font-bold">
                                {activeAccount?.username?.slice(0, 2).toUpperCase() || 'U'}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 text-left overflow-hidden">
                            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                                {activeAccount?.username || 'User'}
                            </p>
                            <p className="text-xs text-gray-500 truncate">
                                {activeAccount?.instagram_business_id ? 'Instagram' : 'Not Connected'}
                            </p>
                        </div>
                        <ChevronsUpDown className="w-4 h-4 text-gray-400" />
                    </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-64" align="start" side="bottom" sideOffset={4}>
                    <DropdownMenuLabel className="text-xs font-normal text-gray-500 uppercase tracking-wider">
                        Switch Account
                    </DropdownMenuLabel>

                    {accounts.map((account) => (
                        <DropdownMenuItem
                            key={account.id}
                            onClick={() => handleSwitch(account.id)}
                            className="gap-3 p-2 cursor-pointer focus:bg-gray-50 dark:focus:bg-zinc-900"
                        >
                            <Avatar className="w-6 h-6 rounded-md border border-gray-100">
                                <AvatarImage src={account.profile_picture_url} />
                                <AvatarFallback className="rounded-md text-[10px]">
                                    {account.username?.slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                            <span className={`flex-1 truncate text-sm ${account.id === activeAccountId ? 'font-medium' : ''}`}>
                                {account.username}
                            </span>
                            {account.id === activeAccountId && (
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500 ring-2 ring-green-100" />
                            )}
                        </DropdownMenuItem>
                    ))}

                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleAddAccount} className="gap-2 p-2 cursor-pointer text-indigo-600 focus:text-indigo-700 focus:bg-indigo-50">
                        <div className="w-6 h-6 rounded-md flex items-center justify-center border border-dashed border-indigo-200">
                            <Plus className="w-3 h-3" />
                        </div>
                        <span className="font-medium">Add New Account</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
