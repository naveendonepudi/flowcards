
import React, { useState, useEffect } from 'react';
import { X, FolderPlus, Folder, ChevronRight, Check } from 'lucide-react';
import { BookmarkFolder, AnkiCard } from '../types';
import * as dbService from '../services/db';

interface BookmarkModalProps {
  isOpen: boolean;
  username: string;
  card: AnkiCard;
  deckName: string;
  onClose: () => void;
}

export const BookmarkModal: React.FC<BookmarkModalProps> = ({ isOpen, username, card, deckName, onClose }) => {
  const [folders, setFolders] = useState<BookmarkFolder[]>([]);
  const [newFolderName, setNewFolderName] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savedFolderId, setSavedFolderId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadFolders();
      setShowCreateForm(false);
      setNewFolderName('');
      setSavedFolderId(null);
    }
  }, [isOpen]);

  const loadFolders = async () => {
    setLoading(true);
    const data = await dbService.getFolders(username);
    setFolders(data);
    setLoading(false);
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    const newFolder: BookmarkFolder = {
      id: crypto.randomUUID(),
      name: newFolderName.trim(),
      username
    };
    await dbService.saveFolder(newFolder);
    setNewFolderName('');
    setShowCreateForm(false);
    loadFolders();
  };

  const handleSaveToFolder = async (folderId: string) => {
    const bookmark = {
      id: crypto.randomUUID(),
      username,
      folderId,
      card,
      deckName,
      createdAt: Date.now()
    };
    await dbService.saveBookmark(bookmark);
    setSavedFolderId(folderId);
    setTimeout(() => {
      onClose();
    }, 1000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="relative w-full max-w-md bg-white rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-500">
        <div className="p-8 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-900">Save for Later</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Select Study Folder</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-full transition-colors">
            <X className="w-6 h-6 text-slate-400" />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="py-12 flex justify-center"><div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {folders.length === 0 && !showCreateForm && (
                <div className="py-8 text-center text-slate-400 font-bold text-sm">No folders yet. Create your first study list!</div>
              )}
              
              {folders.map(folder => (
                <button 
                  key={folder.id}
                  onClick={() => handleSaveToFolder(folder.id)}
                  disabled={savedFolderId !== null}
                  className="flex items-center justify-between p-5 bg-slate-50 rounded-2xl border-2 border-transparent hover:border-indigo-100 hover:bg-indigo-50/30 transition-all group"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-white rounded-xl text-indigo-500 shadow-sm"><Folder className="w-5 h-5 fill-current opacity-20 group-hover:opacity-100" /></div>
                    <span className="font-bold text-slate-800">{folder.name}</span>
                  </div>
                  {savedFolderId === folder.id ? (
                    <Check className="w-5 h-5 text-emerald-500" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-900" />
                  )}
                </button>
              ))}
            </div>
          )}

          {showCreateForm ? (
            <form onSubmit={handleCreateFolder} className="pt-4 animate-in slide-in-from-top-2">
              <input 
                autoFocus
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                placeholder="Folder name (e.g. Final Exam)"
                className="w-full h-14 px-6 bg-white border-2 border-slate-100 rounded-2xl outline-none focus:border-indigo-500 font-bold mb-3"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowCreateForm(false)} className="flex-1 py-4 font-black text-slate-400 uppercase text-xs tracking-widest">Cancel</button>
                <button type="submit" className="flex-2 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest px-6 shadow-lg shadow-indigo-100">Create Folder</button>
              </div>
            </form>
          ) : (
            <button 
              onClick={() => setShowCreateForm(true)}
              className="w-full flex items-center justify-center gap-3 p-5 border-2 border-dashed border-slate-100 rounded-2xl text-slate-400 hover:text-slate-900 hover:border-slate-200 transition-all group"
            >
              <FolderPlus className="w-5 h-5" />
              <span className="font-black uppercase text-xs tracking-widest">New Folder</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
