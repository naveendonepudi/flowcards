import React, { useState, useRef } from 'react';
import { X, Image as ImageIcon, Camera, Check, Loader2 } from 'lucide-react';
import { AnkiCard } from '../types';

interface CreateCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (card: Omit<AnkiCard, 'id' | 'noteId' | 'deckId' | 'ord'>) => Promise<void>;
}

export const CreateCardModal: React.FC<CreateCardModalProps> = ({ isOpen, onClose, onSave }) => {
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!front.trim() || (!back.trim() && !image)) return;

    setIsSubmitting(true);
    try {
      let finalBack = back;
      if (image) {
        finalBack += `<br><br><img src="${image}" style="max-width: 100%; height: auto; border-radius: 8px;">`;
      }

      await onSave({
        front: front,
        back: finalBack
      });
      
      // Reset form
      setFront('');
      setBack('');
      setImage(null);
      onClose();
    } catch (error) {
      console.error('Failed to create card:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="w-full max-w-lg bg-white rounded-[40px] shadow-2xl p-8 animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-black text-slate-900">Add New Card</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-6 h-6 text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 overflow-y-auto custom-scrollbar pr-2">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Question (Front)</label>
            <input
              value={front}
              onChange={(e) => setFront(e.target.value)}
              placeholder="e.g. What is the powerhouse of the cell?"
              className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-slate-950 transition-all font-bold"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Answer (Back)</label>
            <textarea
              value={back}
              onChange={(e) => setBack(e.target.value)}
              placeholder="Enter the answer here..."
              className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-slate-950 transition-all font-bold min-h-[100px] resize-none"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Media Attachment</label>
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="w-full p-6 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-slate-400 hover:bg-slate-50 transition-all group"
            >
              {image ? (
                <div className="relative w-full">
                  <img src={image} alt="Preview" className="w-full h-48 object-cover rounded-xl" />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-xl">
                    <span className="text-white font-bold text-sm">Change Image</span>
                  </div>
                </div>
              ) : (
                <>
                  <div className="p-3 bg-slate-100 rounded-full group-hover:bg-white transition-colors">
                    <Camera className="w-6 h-6 text-slate-400 group-hover:text-slate-950" />
                  </div>
                  <span className="text-xs font-bold text-slate-400 group-hover:text-slate-600">Click to upload or take photo</span>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
              />
            </div>
          </div>

          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-4 rounded-2xl font-black uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-colors text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !front.trim() || (!back.trim() && !image)}
              className="flex-1 py-4 bg-slate-950 text-white rounded-2xl font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all text-xs flex items-center justify-center gap-2 disabled:opacity-50 disabled:active:scale-100"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Save Card
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
