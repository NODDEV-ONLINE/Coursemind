// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatApp } from '@/features/chat/ChatApp';
import { clearPassageCache } from '@/hooks/useSourcePassage';
import { CONSENT_KEY } from '@/lib/consent';
import { resetDataMeter } from '@/lib/data-meter';
import { LOW_DATA_KEY } from '@/lib/preferences';
import { frame, sseResponse, usage, type StreamScript } from './sse-helpers';

/**
 * E5 web smoke tests: the chat renders a streamed answer with citation chips, the
 * source viewer, and the refusal / error states — against a mocked fetch that
 * speaks the proxy's SSE contract.
 */

const COURSE = '8d0f3c2a-5b7e-4c1d-9a2b-3c4d5e6f7a8b';
const DOC = '7b1d2e3f-2222-4a2b-9c3d-000000000002';
const INVENTED_DOC = '99999999-9999-4999-8999-999999999999';
const CHUNK_P3 = 'c1a2b3c4-d5e6-4f70-8a9b-0c1d2e3f4a03';
const CHUNK_P7 = 'c1a2b3c4-d5e6-4f70-8a9b-0c1d2e3f4a07';

type AskHandler = (init: RequestInit | undefined) => Response;
type ChunkHandler = (url: string) => Response;

function mockApi({ ask, chunk }: { ask?: AskHandler; chunk?: ChunkHandler }) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/ask') && ask) return ask(init);
    if (url.includes('/chunks/') && chunk) return chunk(url);
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

const stream =
  (script: StreamScript): AskHandler =>
  (init) =>
    sseResponse(script, init?.signal ?? undefined);

const citedAnswer: StreamScript = {
  chunks: [
    frame('token', { delta: 'A stack is last-in, first-out. [doc:' }),
    frame('token', { delta: `${DOC} p3] A queue is first-in, first-out. [doc:${DOC} p7]` }),
    frame('token', { delta: ` Made-up claim. [doc:${INVENTED_DOC} p99]` }),
    frame('citations', {
      citations: [
        { document_id: DOC, page: 3, chunk_id: CHUNK_P3 },
        { document_id: DOC, page: 7, chunk_id: CHUNK_P7 },
      ],
    }),
    frame('done', { finishReason: 'stop', usage }),
  ],
};

function consentGiven() {
  window.localStorage.setItem(
    CONSENT_KEY,
    JSON.stringify({ version: 1, acceptedAt: new Date().toISOString() }),
  );
}

async function ask(user: ReturnType<typeof userEvent.setup>, question: string) {
  const box = await screen.findByLabelText('Ask a question about your course');
  await user.type(box, question);
  await user.keyboard('{Enter}');
}

beforeEach(() => {
  resetDataMeter();
  clearPassageCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('student chat (smoke)', () => {
  it('streams a cited answer: chips replace markers, invalid citations are dropped', async () => {
    consentGiven();
    const fetchMock = mockApi({ ask: stream(citedAnswer) });
    const user = userEvent.setup();
    render(<ChatApp courseId={COURSE} />);

    await ask(user, 'What is a stack?');
    expect(screen.getByText('What is a stack?')).toBeTruthy(); // immediate echo

    const chip = await screen.findByRole('button', { name: 'Source: document 1, page 3' });
    expect(chip.textContent).toBe('Doc 1 · p.3');
    expect(screen.getByRole('button', { name: 'Source: document 1, page 7' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /page 99/ })).toBeNull();
    expect(document.body.textContent).not.toContain('[doc:');
    expect(screen.getByRole('region', { name: 'Sources' })).toBeTruthy();

    // Low-data is on by default → the compact answer is requested.
    expect(String(fetchMock.mock.calls[0]![0])).toBe(`/api/courses/${COURSE}/ask?lowData=1`);
    // Feedback controls appear once the answer is done.
    expect(screen.getByRole('button', { name: 'Helpful' })).toBeTruthy();
  });

  it('opens the source drawer lazily and renders the passage as plain text', async () => {
    consentGiven();
    const fetchMock = mockApi({
      ask: stream(citedAnswer),
      chunk: (url) =>
        url.endsWith(CHUNK_P3)
          ? Response.json({
              chunk_id: CHUNK_P3,
              document_id: DOC,
              filename: 'Lecture 6.pdf',
              page: 3,
              text: '<b>LIFO</b>: the element added last is removed first.',
            })
          : Response.json({ error: 'not_found' }, { status: 404 }),
    });
    const user = userEvent.setup();
    render(<ChatApp courseId={COURSE} />);
    await ask(user, 'What is a stack?');

    const chip = await screen.findByRole('button', { name: 'Source: document 1, page 3' });
    // No passage is prefetched (low-data): only the ask call so far.
    expect(fetchMock.mock.calls.every(([u]) => !String(u).includes('/chunks/'))).toBe(true);

    await user.click(chip);
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Lecture 6.pdf');
    expect(within(dialog).getByText(/<b>LIFO<\/b>/)).toBeTruthy();
    expect(dialog.querySelector('b')).toBeNull(); // untrusted text never becomes HTML
    expect(within(dialog).getByText('A stack is last-in, first-out.')).toBeTruthy(); // Cited for
    expect(within(dialog).getByText('Source 1 of 2')).toBeTruthy();

    // Next source → 404 → "being updated" state.
    await user.click(within(dialog).getByRole('button', { name: 'Next source' }));
    await within(dialog).findByText('This source is being updated.');

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('renders a refusal as the amber card, not an error', async () => {
    consentGiven();
    mockApi({
      ask: stream({
        chunks: [
          frame('token', { delta: "That isn't covered in your course materials." }),
          frame('citations', { citations: [] }),
          frame('done', {
            finishReason: 'refusal',
            usage: { promptTokens: 0, completionTokens: 0 },
          }),
        ],
      }),
    });
    const user = userEvent.setup();
    render(<ChatApp courseId={COURSE} />);
    await ask(user, "How does Dijkstra's algorithm work?");

    const main = screen.getByRole('main');
    await within(main).findByText('Not in your course materials');
    expect(within(main).getByText(/That isn't covered in your course materials\./)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Source:/ })).toBeNull();
  });

  it('shows the error card with Try again when the answer fails (finishReason error)', async () => {
    consentGiven();
    const fetchMock = mockApi({
      ask: stream({
        chunks: [
          frame('token', { delta: 'Partial' }),
          frame('citations', { citations: [] }),
          frame('done', { finishReason: 'error', usage }),
        ],
      }),
    });
    const user = userEvent.setup();
    render(<ChatApp courseId={COURSE} />);
    await ask(user, 'Explain recursion');

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Something broke on our side')).toBeTruthy();
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('keeps what arrived when the connection drops mid-stream', async () => {
    consentGiven();
    mockApi({
      ask: stream({ chunks: [frame('token', { delta: 'A queue is first-in' })], failAtEnd: true }),
    });
    const user = userEvent.setup();
    render(<ChatApp courseId={COURSE} />);
    await ask(user, 'What is a queue?');

    await screen.findByText('Connection lost. We kept what arrived.');
    expect(screen.getByText('A queue is first-in')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('Stop aborts the stream and keeps the partial answer', async () => {
    consentGiven();
    mockApi({ ask: stream({ chunks: [frame('token', { delta: 'Half an answer' })], hang: true }) });
    const user = userEvent.setup();
    render(<ChatApp courseId={COURSE} />);
    await ask(user, 'Long question');

    await screen.findByText('Half an answer');
    await user.click(screen.getByRole('button', { name: 'Stop generating' }));
    const main = screen.getByRole('main');
    await within(main).findByText(/^Stopped\./);
    expect(within(main).getByText('Half an answer')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Stop generating' })).toBeNull();
  });

  it('down-vote opens the optional "What was wrong?" note', async () => {
    consentGiven();
    mockApi({ ask: stream(citedAnswer) });
    const user = userEvent.setup();
    render(<ChatApp courseId={COURSE} />);
    await ask(user, 'What is a stack?');

    await user.click(await screen.findByRole('button', { name: 'Not helpful' }));
    expect(screen.getByText('What was wrong?')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Wrong source' }));
    await user.click(screen.getByRole('button', { name: 'Send feedback' }));
    await screen.findByText('Thanks. Noted.');
  });
});

describe('consent + settings', () => {
  it('requires consent before the first question and records version + timestamp', async () => {
    const user = userEvent.setup();
    render(<ChatApp courseId={COURSE} />);

    await screen.findByText('Before you start');
    expect(screen.getByText(/^anon-[A-Z2-9]{4}$/)).toBeTruthy();
    expect(screen.queryByLabelText('Ask a question about your course')).toBeNull();

    await user.click(screen.getByRole('button', { name: /Start asking/ }));
    expect(await screen.findByRole('alert')).toBeTruthy(); // must tick first

    await user.click(screen.getByLabelText('I understand and agree'));
    await user.click(screen.getByRole('button', { name: /Start asking/ }));
    await screen.findByLabelText('Ask a question about your course');

    const record = JSON.parse(window.localStorage.getItem(CONSENT_KEY) ?? 'null');
    expect(record.version).toBe(1);
    expect(Number.isNaN(Date.parse(record.acceptedAt))).toBe(false);
  });

  it('low-data toggle persists and changes the request', async () => {
    consentGiven();
    const fetchMock = mockApi({ ask: stream(citedAnswer) });
    const user = userEvent.setup();
    render(<ChatApp courseId={COURSE} />);

    await user.click(await screen.findByRole('button', { name: 'Settings' }));
    const toggle = await screen.findByRole('switch', { name: 'Low-data mode' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    await user.click(toggle);
    expect(window.localStorage.getItem(LOW_DATA_KEY)).toBe('0');
    await user.click(screen.getByRole('button', { name: 'Back to chat' }));

    await ask(user, 'What is a stack?');
    await screen.findByRole('button', { name: 'Source: document 1, page 3' });
    expect(String(fetchMock.mock.calls[0]![0])).toBe(`/api/courses/${COURSE}/ask`);
  });
});
