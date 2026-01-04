
import React, { useState, useEffect } from 'react';
import { ChevronLeft, Folder, Bookmark as BookmarkIcon, Trash2, ArrowRight, Layers, LayoutGrid } from 'lucide-react';
import { BookmarkFolder, Bookmark } from '../types';
import * as dbService from '../services/db';

interface BookmarksViewProps {
  username: string;
  onBack: () => void;
  onStudyCard: (card: any) => void;
}


export const BookmarksView: React.FC<BookmarksViewProps> = ({ username, onBack, onStudyCard }) => {
  const [folders, setFolders] = useState<BookmarkFolder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<BookmarkFolder | null>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFolders();
  }, [username]);

  useEffect(() => {
    if (selectedFolder) {
      loadBookmarks(selectedFolder.id);
    }
  }, [selectedFolder]);

  const loadFolders = async () => {
    setLoading(true);
    const data = await dbService.getFolders(username);
    setFolders(data);
    setLoading(false);
  };

  const loadBookmarks = async (folderId: string) => {
    const data = await dbService.getBookmarks(username, folderId);
    setBookmarks(data);
  };

  const handleDeleteFolder = async (folderId: string) => {
    if (username && window.confirm("Delete this folder and all saved cards inside?")) {
      await dbService.deleteFolder(username, folderId);
      loadFolders();
      if (selectedFolder?.id === folderId) setSelectedFolder(null);
    }
  };

  const handleDeleteBookmark = async (bookmarkId: string) => {
    await dbService.deleteBookmark(username, bookmarkId);
    if (selectedFolder) loadBookmarks(selectedFolder.id);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <button onClick={selectedFolder ? () => setSelectedFolder(null) : onBack} className="flex items-center gap-3 text-slate-400 font-bold hover:text-slate-950 transition-colors">
          <ChevronLeft className="w-5 h-5" /> {selectedFolder ? 'Back to Saved' : 'Back to Library'}
        </button>
        <div className="text-right">
          <h2 className="text-2xl font-black tracking-tight text-slate-900">{selectedFolder ? selectedFolder.name : 'Saved Content'}</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
            {selectedFolder ? `${bookmarks.length} Bookmarks` : `${folders.length} Collections`}
          </p>
        </div>
      </div>

      {!selectedFolder ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {folders.length === 0 ? (
            <div className="col-span-full py-24 flex flex-col items-center text-center space-y-6 bg-white rounded-[40px] border border-slate-100 border-dashed border-2">
              <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-200">
                <BookmarkIcon className="w-10 h-10" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-black text-slate-800">No Saved Cards</h3>
                <p className="text-slate-400 text-sm max-w-xs mx-auto font-medium">Bookmark important cards during your study sessions to see them here.</p>
              </div>
            </div>
          ) : (
            folders.map(folder => (
              <div
                key={folder.id}
                className="group relative bg-white rounded-[40px] p-8 border border-slate-100 shadow-xl shadow-slate-200/40 hover:shadow-slate-300 transition-all duration-500 overflow-hidden cursor-pointer"
                onClick={() => setSelectedFolder(folder)}
              >
                <div className="relative z-10 space-y-6">
                  <div className="flex justify-between items-start">
                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl"><Folder className="w-6 h-6 fill-current opacity-40" /></div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.id); }}
                      className="p-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 line-clamp-1">{folder.name}</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2 flex items-center gap-2">
                      <LayoutGrid className="w-3 h-3" /> Study Collection
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-indigo-600 font-black text-xs uppercase tracking-widest pt-2">
                    Open Folder <ArrowRight className="w-4 h-4" />
                  </div>
                </div>
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50/50 rounded-full blur-3xl -mr-16 -mt-16 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
          {bookmarks.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-[40px] border border-slate-100">
              <p className="text-slate-400 font-bold">This folder is empty.</p>
            </div>
          ) : (
            bookmarks.map(bookmark => (
              <div
                key={bookmark.id}
                className="group w-full bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm hover:shadow-md transition-all flex items-center justify-between"
              >
                <div className="flex flex-col gap-1 overflow-hidden">
                  <div className="flex items-center gap-3">
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[9px] font-black uppercase tracking-widest rounded-md">
                      {bookmark.deckName}
                    </span>
                    <span className="text-slate-300 text-[9px] font-bold">
                      {new Date(bookmark.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div
                    className="font-bold text-slate-800 line-clamp-1 pr-8"
                    dangerouslySetInnerHTML={{ __html: bookmark.card.front.replace(/<[^>]*>?/gm, '') }}
                  />
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => handleDeleteBookmark(bookmark.id)}
                    className="p-3 text-slate-200 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => onStudyCard(bookmark.card)}
                    className="p-3 bg-slate-950 text-white rounded-2xl hover:bg-slate-800 active:scale-90 transition-all shadow-lg"
                  >
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
