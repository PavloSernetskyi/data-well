'use client';

import ChatWidget from '../components/ChatWidget';
import { useState } from 'react';

export default function Home() {
  const [form, setForm] = useState({
    age: '',
    gender: '',
    height: '',
    weight: '',
    city: '',
    country: '',
    zip: '',
    occupation: '',
    education: '',
    smoking: '',
    drinksPerWeek: '',
  });
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      const result = await res.json();
      if (result.success) alert('Data submitted to DataWell!');
      else alert('Failed to submit.');
    } catch (err: unknown) {
      console.error('Error submitting data:', err);
      alert('Network or server error.');
    }
  };

  // Summarize handler (calls a new API endpoint)
  const handleSummarize = async () => {
    setLoading(true);
    setSummary(null);
    try {
      const res = await fetch('/api/summarize', { method: 'GET' });
      const result = await res.json();
      if (result.success) setSummary(result.summary);
      else setSummary('Failed to summarize.');
    } catch (err: unknown) {
      console.error('Error summarizing data:', err);
      setSummary('Network or server error.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-gradient-to-br from-green-200 to-blue-200 font-mono p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white/30 text-black shadow-lg p-8 rounded max-w-md w-full backdrop-blur-md"
      >
        <h1 className="text-2xl font-bold mb-4 text-center text-black">
          DataWell - individual insights, statistics and group analytics.
        </h1>

        {(
          [
            ['Age', 'age'],
            ['Gender', 'gender', ['Male', 'Female', 'Other']],
            ['Height (cm)', 'height'],
            ['Weight (kg)', 'weight'],
            ['City', 'city'],
            ['Country', 'country'],
            ['Zip Code', 'zip'],
            ['Occupation', 'occupation'],
            ['Education', 'education'],
            ['Smoking', 'smoking', ['Yes', 'No']],
            ['Drinks per Week', 'drinksPerWeek'],
          ] as [string, keyof typeof form, string[]?][]
        ).map(([label, name, options]) =>
          options ? (
            <select
              key={`select-${name}`}
              name={name}
              value={form[name]}
              onChange={handleChange}
              className="bg-white/40 text-black border border-white/50 p-2 rounded w-full mb-3"
              required
            >
              <option value="">{label}</option>
              {options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : (
            <input
              key={`input-${name}`}
              name={name}
              type={['age', 'height', 'weight', 'drinksPerWeek'].includes(name) ? 'number' : 'text'}
              placeholder={label}
              value={form[name]}
              onChange={handleChange}
              className="bg-white/40 text-black border border-white/50 p-2 rounded w-full mb-3"
              required
            />
          )
        )}

        <button
          type="submit"
          className="w-full mt-4 bg-green-300 hover:shadow-md text-black text-lg py-2 px-4 rounded"
        >
          Submit to DataWell
        </button>
      </form>

      <button
        onClick={handleSummarize}
        className="mt-6 bg-blue-400 hover:shadow-md text-black text-lg py-2 px-4 rounded"
        disabled={loading}
      >
        {loading ? 'Summarizing...' : 'Summarize Latest Users'}
      </button>

      {summary && (
        <div className="mt-4 bg-white/70 text-black p-4 rounded shadow max-w-xl w-full">
          <h2 className="font-bold mb-2">Summary:</h2>
          <pre className="whitespace-pre-wrap">{summary}</pre>
        </div>
      )}
            {/* Add Chat Widget */}
            <ChatWidget />
    </div>
  );
}
