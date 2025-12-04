"use client";

import { useState, useEffect } from "react";
import { Search, Upload, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useDropzone } from "react-dropzone";
import { useRouter } from "next/navigation";
import { processImageSearch } from "@/actions/home";
import useFetch from "@/hooks/use-fetch";

/**
 * Convert any image (including HEIC from iPhone) to a JPEG File and optionally downscale.
 * Returns a File object of type image/jpeg.
 */
async function convertToJpeg(originalFile, { maxWidth = 1600, quality = 0.85 } = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      // createImageBitmap works in modern browsers (including Safari) and will decode HEIC -> bitmap
      const imageBitmap = await createImageBitmap(originalFile);

      // compute target size preserving aspect ratio
      const ratio = Math.min(1, maxWidth / imageBitmap.width);
      const targetWidth = Math.round(imageBitmap.width * ratio);
      const targetHeight = Math.round(imageBitmap.height * ratio);

      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(imageBitmap, 0, 0, targetWidth, targetHeight);

      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("Failed to convert image to JPEG"));
          const newFile = new File([blob], (originalFile.name || "image").replace(/\.[^/.]+$/, "") + ".jpg", {
            type: "image/jpeg",
            lastModified: Date.now(),
          });
          resolve(newFile);
        },
        "image/jpeg",
        quality
      );
    } catch (err) {
      // fallback: try using HTMLImageElement if createImageBitmap fails
      try {
        const url = URL.createObjectURL(originalFile);
        const img = new Image();
        img.onload = () => {
          const ratio = Math.min(1, maxWidth / img.width);
          const targetWidth = Math.round(img.width * ratio);
          const targetHeight = Math.round(img.height * ratio);

          const canvas = document.createElement("canvas");
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

          canvas.toBlob(
            (blob) => {
              URL.revokeObjectURL(url);
              if (!blob) return reject(new Error("Failed to convert image to JPEG (fallback)"));
              const newFile = new File([blob], (originalFile.name || "image").replace(/\.[^/.]+$/, "") + ".jpg", {
                type: "image/jpeg",
                lastModified: Date.now(),
              });
              resolve(newFile);
            },
            "image/jpeg",
            quality
          );
        };
        img.onerror = (e) => {
          URL.revokeObjectURL(url);
          reject(err);
        };
        img.src = url;
      } catch (err2) {
        reject(err);
      }
    }
  });
}

export function HomeSearch() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [searchImage, setSearchImage] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isImageSearchActive, setIsImageSearchActive] = useState(false);

  // Use the useFetch hook for image processing
  const {
    loading: isProcessing,
    fn: processImageFn,
    data: processResult,
    error: processError,
  } = useFetch(processImageSearch);

  // Handle process result and errors with useEffect
  useEffect(() => {
    if (processResult?.success) {
      const params = new URLSearchParams();

      // Add extracted params to the search
      if (processResult.data.make) params.set("make", processResult.data.make);
      if (processResult.data.bodyType) params.set("bodyType", processResult.data.bodyType);
      if (processResult.data.color) params.set("color", processResult.data.color);

      // Redirect to search results
      router.push(`/cars?${params.toString()}`);
    }
  }, [processResult, router]);

  useEffect(() => {
    if (processError) {
      toast.error("Failed to analyze image: " + (processError.message || "Unknown error"));
    }
  }, [processError]);

  // Handle image upload with react-dropzone
  const onDrop = async (acceptedFiles) => {
    const originalFile = acceptedFiles[0];
    if (!originalFile) return;

    const MAX_ALLOWED_BYTES = 15 * 1024 * 1024; // 15 MB
    if (originalFile.size > MAX_ALLOWED_BYTES) {
      toast.error("Image size must be less than 15MB");
      return;
    }

    setIsUploading(true);

    try {
      let processedFile = originalFile;

      // If file is HEIC/HEIF or very large, convert/resample to JPEG
      const lowerType = (originalFile.type || "").toLowerCase();
      const shouldConvert =
        lowerType.includes("heic") ||
        lowerType.includes("heif") ||
        !["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(lowerType) ||
        originalFile.size > 5 * 1024 * 1024; // convert if >5MB to reduce payload

      if (shouldConvert) {
        try {
          processedFile = await convertToJpeg(originalFile, { maxWidth: 1600, quality: 0.85 });
        } catch (convErr) {
          console.error("Image conversion failed:", convErr);
          // If conversion fails, fall back to original only if it's JPEG/PNG
          if (!lowerType.includes("jpeg") && !lowerType.includes("jpg") && !lowerType.includes("png") && !lowerType.includes("webp")) {
            throw new Error("Unsupported image format and conversion failed. Please pick a JPEG/PNG image.");
          } else {
            processedFile = originalFile;
          }
        }
      }

      // Create preview from processedFile
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
        setSearchImage(processedFile);
        setIsUploading(false);
        toast.success("Image uploaded successfully");
      };
      reader.onerror = (err) => {
        console.error("FileReader error:", err);
        setIsUploading(false);
        toast.error("Failed to read the image");
      };
      reader.readAsDataURL(processedFile);
    } catch (err) {
      console.error("onDrop error:", err);
      setIsUploading(false);
      toast.error(err.message || "Failed to process uploaded image");
    }
  };

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: { "image/*": [] }, // accept any image; we'll convert unsupported formats client-side
    maxFiles: 1,
    maxSize: 15 * 1024 * 1024,
  });

  // Handle text search submissions
  const handleTextSearch = (e) => {
    e.preventDefault();
    if (!searchTerm.trim()) {
      toast.error("Please enter a search term");
      return;
    }

    router.push(`/cars?search=${encodeURIComponent(searchTerm)}`);
  };

  // Handle image search submissions
  const handleImageSearch = async (e) => {
    e.preventDefault();
    if (!searchImage) {
      toast.error("Please upload an image first");
      return;
    }

    try {
      // processImageFn is from useFetch hook; await it so any errors can be caught
      await processImageFn(searchImage);
    } catch (err) {
      console.error("Image search failed:", err);
      toast.error(err.message || "Image analysis failed");
    }
  };

  return (
    <div>
      <form onSubmit={handleTextSearch}>
        <div className="relative flex items-center">
          <Search className="absolute left-3 w-5 h-5" />
          <Input
            type="text"
            placeholder="Search here with AI..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-12 py-6 w-full rounded-full border-gray-300 bg-white/95 backdrop-blur-sm"
          />

          {/* Image Search Button */}
          <div className="absolute right-[100px]">
            <Camera
              size={35}
              onClick={() => setIsImageSearchActive(!isImageSearchActive)}
              className="cursor-pointer rounded-xl p-1.5"
              style={{
                background: isImageSearchActive ? "black" : "",
                color: isImageSearchActive ? "white" : "",
              }}
            />
          </div>

          <Button type="submit" className="absolute right-2 rounded-full">
            Search
          </Button>
        </div>
      </form>

      {isImageSearchActive && (
        <div className="mt-4">
          <form onSubmit={handleImageSearch} className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-3xl p-6 text-center">
              {imagePreview ? (
                <div className="flex flex-col items-center">
                  <img src={imagePreview} alt="Car preview" className="h-40 object-contain mb-4" />
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearchImage(null);
                      setImagePreview("");
                      toast.info("Image removed");
                    }}
                  >
                    Remove Image
                  </Button>
                </div>
              ) : (
                <div {...getRootProps()} className="cursor-pointer">
                  <input {...getInputProps()} />
                  <div className="flex flex-col items-center">
                    <Upload className="h-12 w-12 text-gray-400 mb-2" />
                    <p className="text-gray-500 mb-2">
                      {isDragActive && !isDragReject ? "Leave the file here to upload" : "Drag & drop a car image or click to select"}
                    </p>
                    {isDragReject && <p className="text-red-500 mb-2">Invalid image type or too large</p>}
                    <p className="text-gray-400 text-sm">Supports: JPG, PNG, HEIC (converted) — max 15MB</p>
                  </div>
                </div>
              )}
            </div>

            {imagePreview && (
              <Button type="submit" className="w-full" disabled={isUploading || isProcessing}>
                {isUploading ? "Uploading..." : isProcessing ? "Analyzing image..." : "Search with this Image"}
              </Button>
            )}
          </form>
        </div>
      )}
    </div>
  );
}

export default HomeSearch; 
