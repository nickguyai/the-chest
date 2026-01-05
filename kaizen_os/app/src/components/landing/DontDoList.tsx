import { Card } from '../../lib/api'

interface DontDoListProps {
  vetoes: Card[]
  onAddVeto?: () => void
}

export function DontDoList({ vetoes, onAddVeto }: DontDoListProps) {
  return (
    <section className="dont-do-section">
      <h2 className="section-title">Don't Do List</h2>
      <div className="dont-do-list">
        {vetoes.map((veto, index) => (
          <div
            key={veto.id}
            className="dont-do-item"
          >
            <span className="item-number">
              {index + 1}
            </span>
            <span className="item-text">{veto.title}</span>
          </div>
        ))}
        <div
          onClick={onAddVeto}
          className="dont-do-item justify-center border-dashed cursor-pointer text-muted-foreground opacity-60 hover:opacity-100 transition-opacity"
        >
          + Add Veto
        </div>
      </div>
    </section>
  )
}
