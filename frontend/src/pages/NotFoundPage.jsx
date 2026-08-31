import { Link } from 'react-router-dom'
import Breadcrumb from '../components/layout/Breadcrumb.jsx'
import Panel from '../components/ui/Panel.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'

export default function NotFoundPage() {
  return (
    <>
      <Breadcrumb trail={[{ label: 'Not found' }]} />
      <div className="page-content">
        <div className="container-fluid section">
          <Panel title="Page not found" icon="ri-error-warning-line">
            <EmptyState icon="ri-compass-3-line" message="That page doesn't exist.">
              <Link to="/" className="btn-gen btn-gen--sm">
                <i className="ri-arrow-left-line" />
                Back to start
              </Link>
            </EmptyState>
          </Panel>
        </div>
      </div>
    </>
  )
}
