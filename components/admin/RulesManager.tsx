"use client";

import { useState, useEffect } from "react";
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Trash2, Plus, FileText } from "lucide-react";

interface Rule {
  id: string;
  title: string;
  content: string;
  createdAt: any;
}

export function RulesManager() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "rules"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Rule[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Rule[];
      setRules(data);
    }, (error) => {
      console.error("Error fetching rules:", error);
    });

    return () => unsubscribe();
  }, []);

  async function handleAddRule(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, "rules"), {
        title: title.trim(),
        content: content.trim(),
        createdAt: serverTimestamp()
      });
      setTitle("");
      setContent("");
    } catch (error) {
      console.error("Error adding rule:", error);
      alert("Failed to add rule");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this rule?")) return;
    try {
      await deleteDoc(doc(db, "rules", id));
    } catch (error) {
      console.error("Error deleting rule:", error);
      alert("Failed to delete rule");
    }
  }

  return (
    <div className="bg-litter-card rounded-2xl border border-litter-border shadow-sm overflow-hidden mt-6 mb-6">
      <div className="px-6 py-4 border-b border-litter-border">
        <h2 className="font-display font-semibold text-litter-text text-base flex items-center gap-2">
          <FileText className="w-5 h-5 text-litter-primary" />
          System Rules
        </h2>
        <p className="text-xs text-litter-muted mt-0.5">Manage the rules collection</p>
      </div>
      
      <div className="p-6">
        <form onSubmit={handleAddRule} className="mb-6 bg-litter-bg p-4 rounded-xl border border-litter-border">
          <h3 className="text-sm font-semibold mb-3">Add New Rule</h3>
          <div className="space-y-3">
            <div>
              <input
                type="text"
                placeholder="Rule Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-litter-border rounded-lg bg-litter-card focus:border-litter-primary focus:ring-1 focus:ring-litter-primary transition-all outline-none"
                required
              />
            </div>
            <div>
              <textarea
                placeholder="Rule Content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-litter-border rounded-lg bg-litter-card focus:border-litter-primary focus:ring-1 focus:ring-litter-primary transition-all min-h-[80px] outline-none"
                required
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-4 py-2 bg-litter-primary text-white text-sm font-semibold rounded-lg hover:bg-litter-primary-hover transition-colors disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              {isSubmitting ? "Adding..." : "Add Rule"}
            </button>
          </div>
        </form>

        <div className="space-y-3">
          {rules.length === 0 ? (
            <p className="text-sm text-litter-muted text-center py-4">No rules found. Add one above.</p>
          ) : (
            rules.map(rule => (
              <div key={rule.id} className="p-4 border border-litter-border rounded-xl bg-litter-bg flex items-start justify-between gap-4">
                <div>
                  <h4 className="font-semibold text-sm text-litter-text">{rule.title}</h4>
                  <p className="text-sm text-litter-muted mt-1 whitespace-pre-wrap">{rule.content}</p>
                </div>
                <button
                  onClick={() => handleDelete(rule.id)}
                  className="p-2 text-litter-muted hover:text-litter-alert hover:bg-litter-card rounded-lg transition-colors shrink-0"
                  title="Delete rule"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
