import { useState, useRef, useCallback } from "react";
import { Upload, X, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface UploadedFile {
  file: File;
  preview: string;
  progress: number;
  uploading: boolean;
  done: boolean;
  dbId?: string;
  bgRemoving?: boolean;
  bgDone?: boolean;
}

interface Props {
  projectId: string;
  onComplete: () => void;
  uploadedImages: { id: string; url: string; name: string }[];
  setUploadedImages: React.Dispatch<React.SetStateAction<{ id: string; url: string; name: string }[]>>;
}

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 20 * 1024 * 1024;

const UploadStage = ({ projectId, onComplete, uploadedImages, setUploadedImages }: Props) => {
  const { user } = useAuth();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const valid = Array.from(newFiles).filter((f) => {
      if (!ACCEPTED.includes(f.type)) { toast.error(`${f.name}: unsupported format`); return false; }
      if (f.size > MAX_SIZE) { toast.error(`${f.name}: exceeds 20MB`); return false; }
      return true;
    });
    setFiles((prev) => [
      ...prev,
      ...valid.map((file) => ({ file, preview: URL.createObjectURL(file), progress: 0, uploading: false, done: false })),
    ]);
  }, []);

  const removeFile = (idx: number) => {
    setFiles((prev) => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const uploadAll = async () => {
    if (!user) return;
    const toUpload = files.filter((f) => !f.done);
    for (let i = 0; i < toUpload.length; i++) {
      const f = toUpload[i];
      const idx = files.indexOf(f);
      setFiles((prev) => prev.map((p, j) => j === idx ? { ...p, uploading: true, progress: 10 } : p));

      const path = `${user.id}/${projectId}/originals/${Date.now()}_${f.file.name}`;
      const { error: storageError } = await supabase.storage
        .from("project-images")
        .upload(path, f.file, { upsert: false });

      if (storageError) {
        toast.error(`Failed to upload ${f.file.name}`);
        setFiles((prev) => prev.map((p, j) => j === idx ? { ...p, uploading: false, progress: 0 } : p));
        continue;
      }

      setFiles((prev) => prev.map((p, j) => j === idx ? { ...p, progress: 70 } : p));

      const { data: urlData } = supabase.storage.from("project-images").getPublicUrl(path);

      const { data: dbData, error: dbError } = await supabase
        .from("project_images")
        .insert({ project_id: projectId, storage_url: urlData.publicUrl, type: "original" as const })
        .select()
        .single();

      if (dbError) {
        toast.error(`Failed to save record for ${f.file.name}`);
        continue;
      }

      setFiles((prev) => prev.map((p, j) => j === idx ? { ...p, uploading: false, progress: 100, done: true, dbId: dbData.id } : p));
      setUploadedImages((prev) => [...prev, { id: dbData.id, url: urlData.publicUrl, name: f.file.name }]);
    }
    toast.success("Upload complete");
  };

  const removeUploaded = async (id: string) => {
    await supabase.from("project_images").delete().eq("id", id);
    setUploadedImages((prev) => prev.filter((img) => img.id !== id));
  };

  const allDone = files.length > 0 && files.every((f) => f.done);
  const hasImages = uploadedImages.length > 0 || allDone;

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex-1 overflow-auto px-6 py-6 space-y-6 page-enter">
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed bg-card py-16 transition-all cursor-pointer ${
          isDragOver
            ? "drop-zone-active border-primary bg-primary/5"
            : "border-primary/40 hover:border-primary/70"
        }`}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className={`mb-3 h-10 w-10 transition-colors ${isDragOver ? "text-primary" : "text-primary/50"}`} />
        <p className="font-heading text-lg font-semibold text-foreground">
          {isDragOver ? "Drop your images here" : "Drag & drop your jewelry images"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">JPG, PNG, or WEBP — up to 20MB each</p>
        <Button variant="outline" className="mt-4 gap-2 border-primary/40 hover:border-primary hover:text-primary gold-glow-hover" onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}>
          <ImagePlus className="h-4 w-4" /> Browse Files
        </Button>
        <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.webp" multiple className="hidden" onChange={(e) => e.target.files && addFiles(e.target.files)} />
      </div>

      {/* Pending file previews */}
      {files.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-heading text-sm font-semibold text-muted-foreground">Selected Files</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border border-border/50 bg-card p-3 stagger-card">
                <img src={f.preview} alt="" className="h-14 w-14 rounded-md object-cover" loading="lazy" />
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="truncate text-sm font-medium">{f.file.name}</p>
                  <p className="text-xs text-muted-foreground">{formatSize(f.file.size)}</p>
                  {f.uploading && <Progress value={f.progress} className="h-1.5 progress-smooth [&>div]:bg-primary" />}
                  {f.done && <p className="text-xs text-emerald-400">Uploaded ✓</p>}
                </div>
                {!f.uploading && !f.done && (
                  <button onClick={() => removeFile(i)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {!allDone && (
            <Button onClick={uploadAll} className="gap-2 gold-glow-hover">
              <Upload className="h-4 w-4" /> Upload {files.filter((f) => !f.done).length} File{files.filter((f) => !f.done).length !== 1 ? "s" : ""}
            </Button>
          )}
        </div>
      )}

      {/* Already uploaded images */}
      {uploadedImages.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-heading text-sm font-semibold text-muted-foreground">Uploaded Images</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {uploadedImages.map((img) => (
              <div key={img.id} className="relative group rounded-lg border border-border/50 bg-card overflow-hidden stagger-card">
                <img src={img.url} alt={img.name} className="h-36 w-full object-cover image-hover" loading="lazy" />
                <div className="p-2 flex items-center justify-between">
                  <p className="truncate text-xs text-muted-foreground">{img.name}</p>
                  <button onClick={() => removeUploaded(img.id)} className="text-muted-foreground hover:text-destructive">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CTA */}
      {hasImages && (
        <div className="flex justify-end pt-2">
          <Button onClick={onComplete} size="lg" className="gap-2 gold-glow-hover">
            Enhance Images →
          </Button>
        </div>
      )}
    </div>
  );
};

export default UploadStage;
