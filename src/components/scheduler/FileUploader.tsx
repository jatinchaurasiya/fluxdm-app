import { useRef, useState } from 'react';
import { UploadCloud, FileVideo, Image as ImageIcon, CircleDashed, Layers } from 'lucide-react';
import { toast } from 'sonner';

interface FileUploaderProps {
    mediaType: 'REEL' | 'IMAGE' | 'STORY' | 'CAROUSEL';
    onFileSelect: (files: File[]) => void;
    children?: React.ReactNode;
}

export default function FileUploader({ mediaType, onFileSelect, children }: FileUploaderProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [isDragOver, setIsDragOver] = useState(false);

    // Determine accepted file types
    const getAccept = () => {
        switch (mediaType) {
            case 'REEL': return 'video/mp4,video/quicktime';
            case 'IMAGE': return 'image/jpeg,image/png,image/webp';
            case 'STORY': return 'image/*,video/mp4,video/quicktime'; // Story can be both
            case 'CAROUSEL': return 'image/*,video/*'; // Carousel can be mixed on IG (in theory, API limits might vary but UI should allow select)
            default: return '*/*';
        }
    };

    const handleClick = () => {
        inputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const fileList = Array.from(e.target.files);
            validateAndPass(fileList);
        }
        // Reset input value to allow re-selecting same file if needed
        if (inputRef.current) inputRef.current.value = '';
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const fileList = Array.from(e.dataTransfer.files);
            validateAndPass(fileList);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
    };

    const validateAndPass = (files: File[]) => {
        // Redundant validation to ensure Dragged files match constraints
        // (Input accept attribute only restricts click selection)
        let validFiles: File[] = [];

        for (const file of files) {
            if (mediaType === 'REEL' && !file.type.startsWith('video/')) {
                toast.error(`Skipped ${file.name}: Reels must be video.`);
                continue;
            }
            if (mediaType === 'IMAGE' && !file.type.startsWith('image/')) {
                toast.error(`Skipped ${file.name}: Posts must be images.`);
                continue;
            }
            if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
                toast.error(`Skipped ${file.name}: Invalid media type.`);
                continue;
            }
            validFiles.push(file);
        }

        if (validFiles.length > 0) {
            onFileSelect(validFiles);
        }
    };

    return (
        <div
            onClick={handleClick}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`
                relative w-full h-full flex flex-col items-center justify-center p-8 transition-all cursor-pointer group
                ${isDragOver
                    ? 'bg-blue-50/50 border-2 border-dashed border-blue-500 dark:bg-blue-900/20'
                    : 'bg-gray-50/50 hover:bg-gray-100/50 dark:bg-zinc-950 border-2 border-dashed border-transparent hover:border-gray-200 dark:border-zinc-800 dark:hover:border-zinc-700'
                }
            `}
        >
            <input
                type="file"
                ref={inputRef}
                className="hidden"
                accept={getAccept()}
                multiple={mediaType === 'CAROUSEL'}
                onChange={handleFileChange}
                aria-label="File Upload"
            />

            {/* If children provided (e.g. preview), show them inside. Otherwise show default empty state */}
            {children ? (
                children
            ) : (
                <div className="text-center space-y-4 pointer-events-none">
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-full w-fit mx-auto group-hover:scale-110 transition-transform">
                        {mediaType === 'REEL' && <FileVideo className="w-8 h-8 text-blue-500 dark:text-blue-400" />}
                        {mediaType === 'IMAGE' && <ImageIcon className="w-8 h-8 text-blue-500 dark:text-blue-400" />}
                        {mediaType === 'CAROUSEL' && <Layers className="w-8 h-8 text-blue-500 dark:text-blue-400" />}
                        {mediaType === 'STORY' && <CircleDashed className="w-8 h-8 text-pink-500 dark:text-pink-400" />}
                    </div>
                    <div className="space-y-1">
                        <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100">
                            Click to upload {mediaType === 'CAROUSEL' ? 'files' : mediaType.toLowerCase()}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-zinc-500">
                            or drag and drop here
                        </p>
                        <p className="text-xs text-gray-400 dark:text-zinc-600 font-mono pt-2">
                            {mediaType === 'REEL' ? 'Supports MP4, MOV' : 'Supports JPG, PNG (Max 10MB)'}
                        </p>
                    </div>
                </div>
            )}

            {/* Show overlay instruction on drag over */}
            {isDragOver && (
                <div className="absolute inset-0 bg-blue-500/10 backdrop-blur-[1px] flex items-center justify-center z-10 pointer-events-none">
                    <div className="bg-white/90 dark:bg-zinc-900/90 p-4 rounded-xl shadow-xl flex items-center gap-2 border border-blue-100 dark:border-blue-900">
                        <UploadCloud className="w-6 h-6 text-blue-500 animate-bounce" />
                        <span className="font-semibold text-blue-500">Drop to Upload</span>
                    </div>
                </div>
            )}
        </div>
    );
}
