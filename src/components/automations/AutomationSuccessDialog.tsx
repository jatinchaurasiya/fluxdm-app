
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle, ArrowRight, Plus } from "lucide-react";

interface AutomationSuccessDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onViewAutomations: () => void;
    onCreateAnother: () => void;
}

export function AutomationSuccessDialog({
    open,
    onOpenChange,
    onViewAutomations,
    onCreateAnother
}: AutomationSuccessDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <div className="mx-auto bg-green-100 dark:bg-green-900/30 p-3 rounded-full mb-4 w-fit">
                        <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-500" />
                    </div>
                    <DialogTitle className="text-center text-xl">Automation Launched!</DialogTitle>
                    <DialogDescription className="text-center pt-2">
                        Your automation is now active and ready to reply to comments.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-3 py-4">
                    <Button
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 text-base font-semibold shadow-lg shadow-blue-900/20"
                        onClick={onViewAutomations}
                    >
                        View My Automations <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                    <Button
                        variant="outline"
                        className="w-full h-12 border-2 border-gray-200 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800 text-gray-700 dark:text-gray-300"
                        onClick={onCreateAnother}
                    >
                        <Plus className="w-4 h-4 mr-2" /> Create Another
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
