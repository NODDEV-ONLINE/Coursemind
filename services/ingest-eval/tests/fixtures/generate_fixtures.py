"""Generate sample fixture files for the test suite (E1).

Run once (or whenever the fixtures need regenerating):
    python tests/fixtures/generate_fixtures.py

Produces:
    tests/fixtures/sample.pdf  — 2-page text PDF via PyMuPDF writer
    tests/fixtures/sample.pptx — 3-slide PPTX via python-pptx

Both files are <100 KB and contain enough realistic text to exercise the
full parse→chunk→embed pipeline in tests.
"""

from __future__ import annotations

from pathlib import Path

FIXTURES_DIR = Path(__file__).parent


def generate_pdf(output: Path) -> None:
    """Generate a 2-page text PDF using PyMuPDF's document writer."""
    import pymupdf as fitz  # PyMuPDF >= 1.24; 'pymupdf' is the preferred import

    doc = fitz.open()

    # Page 1 — general intro text (> 800 chars so chunking produces > 1 chunk)
    page1 = doc.new_page(width=595, height=842)  # A4 points
    text1 = (
        "Introduction to Machine Learning\n\n"
        "Machine learning is a branch of artificial intelligence that enables "
        "systems to learn from data and improve their performance over time "
        "without being explicitly programmed for every task.\n\n"
        "Supervised learning algorithms learn a mapping function from input "
        "variables to an output variable using labelled training examples. "
        "Common supervised learning techniques include linear regression, "
        "logistic regression, support vector machines, and decision trees.\n\n"
        "Unsupervised learning discovers hidden structure in unlabelled data. "
        "Clustering algorithms such as k-means and hierarchical clustering "
        "group similar data points together, while dimensionality reduction "
        "techniques like principal component analysis compress high-dimensional "
        "data into fewer dimensions while preserving variance.\n\n"
        "Reinforcement learning trains an agent to make sequential decisions by "
        "rewarding desired behaviours and penalising undesired ones. It has been "
        "applied successfully in game playing, robotics, and recommendation "
        "systems."
    )
    page1.insert_text((50, 60), text1, fontname="helv", fontsize=11)

    # Page 2 — neural networks topic
    page2 = doc.new_page(width=595, height=842)
    text2 = (
        "Neural Networks and Deep Learning\n\n"
        "Artificial neural networks are computational models loosely inspired "
        "by the biological neural networks in the brain. They consist of layers "
        "of interconnected nodes (neurons) that transform input data through "
        "weighted connections and non-linear activation functions.\n\n"
        "Deep learning refers to neural networks with multiple hidden layers. "
        "Convolutional neural networks (CNNs) excel at image recognition by "
        "learning spatial hierarchies of features. Recurrent neural networks "
        "(RNNs) and their variants — Long Short-Term Memory (LSTM) and Gated "
        "Recurrent Units (GRU) — are suited to sequential data such as text "
        "and time series.\n\n"
        "Transformer architectures, introduced by Vaswani et al. in 2017, use "
        "self-attention mechanisms to relate positions in a sequence. They have "
        "become the dominant architecture for natural language processing tasks "
        "including machine translation, question answering, and text generation."
    )
    page2.insert_text((50, 60), text2, fontname="helv", fontsize=11)

    doc.save(str(output))
    doc.close()
    print(f"Generated {output} ({output.stat().st_size} bytes)")


def generate_pptx(output: Path) -> None:
    """Generate a 3-slide PPTX using python-pptx."""
    from pptx import Presentation

    prs = Presentation()
    blank_layout = prs.slide_layouts[1]  # Title and Content

    def add_slide(title_text: str, body_text: str) -> None:
        slide = prs.slides.add_slide(blank_layout)
        title = slide.shapes.title
        body = slide.placeholders[1]
        if title is not None:
            title.text = title_text
        tf = body.text_frame
        tf.text = body_text

    add_slide(
        "Overview of Machine Learning",
        (
            "Machine learning enables systems to learn from data without "
            "explicit programming. Key paradigms include supervised learning, "
            "unsupervised learning, and reinforcement learning. Applications "
            "span image recognition, natural language processing, autonomous "
            "vehicles, and scientific discovery."
        ),
    )

    add_slide(
        "Supervised Learning Techniques",
        (
            "In supervised learning, models are trained on labelled datasets. "
            "Popular algorithms include linear regression for continuous "
            "outputs, logistic regression for binary classification, support "
            "vector machines for margin maximisation, and ensemble methods such "
            "as random forests and gradient boosting for improved accuracy."
        ),
    )

    add_slide(
        "Deep Learning Architectures",
        (
            "Deep neural networks learn hierarchical representations. "
            "Convolutional networks process grid-structured data like images. "
            "Transformers use self-attention to model long-range dependencies in "
            "text. Large language models pre-trained on massive corpora are "
            "fine-tuned for downstream tasks with limited labelled data."
        ),
    )

    prs.save(str(output))
    print(f"Generated {output} ({output.stat().st_size} bytes)")


if __name__ == "__main__":
    generate_pdf(FIXTURES_DIR / "sample.pdf")
    generate_pptx(FIXTURES_DIR / "sample.pptx")
    print("Fixture generation complete.")
