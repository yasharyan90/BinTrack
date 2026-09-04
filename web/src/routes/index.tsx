import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { FullPageSpinner } from '@/components/ui/spinner'
import { RedirectIfAuthed, RequireAdmin, RequireAuth } from './guards'
import { ErrorBoundary } from './ErrorBoundary'

// Route-level code splitting: a picker on a phone should not download the
// admin dashboard or the chart library to open a pick list (TRD §8).
const Login = lazy(() => import('@/pages/auth/Login'))
const Signup = lazy(() => import('@/pages/auth/Signup'))
const ForgotPassword = lazy(() => import('@/pages/auth/ForgotPassword'))

const Home = lazy(() => import('@/pages/staff/Home'))
const SearchPage = lazy(() => import('@/pages/staff/SearchPage'))
const ProductDetail = lazy(() => import('@/pages/staff/ProductDetail'))
const BinDetail = lazy(() => import('@/pages/staff/BinDetail'))
const Orders = lazy(() => import('@/pages/staff/Orders'))
const OrderNew = lazy(() => import('@/pages/staff/OrderNew'))
const OrderPick = lazy(() => import('@/pages/staff/OrderPick'))
const Receive = lazy(() => import('@/pages/staff/Receive'))
const Transfer = lazy(() => import('@/pages/staff/Transfer'))
const ScanHub = lazy(() => import('@/pages/staff/ScanHub'))
const Movements = lazy(() => import('@/pages/staff/Movements'))
const CountEntry = lazy(() => import('@/pages/staff/CountEntry'))
const Profile = lazy(() => import('@/pages/staff/Profile'))
const More = lazy(() => import('@/pages/staff/More'))

const GrnList = lazy(() => import('@/pages/grn/GrnList'))
const GrnNew = lazy(() => import('@/pages/grn/GrnNew'))
const GrnDetail = lazy(() => import('@/pages/grn/GrnDetail'))
const PurchaseOrders = lazy(() => import('@/pages/admin/PurchaseOrders'))

const Dashboard = lazy(() => import('@/pages/admin/Dashboard'))
const AlertCentre = lazy(() => import('@/pages/admin/AlertCentre'))
const AdminProducts = lazy(() => import('@/pages/admin/Products'))
const ProductForm = lazy(() => import('@/pages/admin/ProductForm'))
const Locations = lazy(() => import('@/pages/admin/Locations'))
const ImportPage = lazy(() => import('@/pages/admin/Import'))
const ExportPage = lazy(() => import('@/pages/admin/Export'))
const Expiry = lazy(() => import('@/pages/admin/Expiry'))
const Counts = lazy(() => import('@/pages/admin/Counts'))
const Users = lazy(() => import('@/pages/admin/Users'))
const SettingsPage = lazy(() => import('@/pages/admin/Settings'))
const Labels = lazy(() => import('@/pages/admin/Labels'))

const NotFound = lazy(() => import('@/pages/NotFound'))

export function AppRoutes() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes>
        <Route element={<RedirectIfAuthed />}>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
        </Route>

        <Route element={<RequireAuth />}>
          <Route
            element={
              <ErrorBoundary>
                <AppShell />
              </ErrorBoundary>
            }
          >
            {/* Staff and admin */}
            <Route index element={<Home />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/products/:productId" element={<ProductDetail />} />
            <Route path="/bins/:binId" element={<BinDetail />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/orders/new" element={<OrderNew />} />
            <Route path="/orders/:orderId" element={<OrderPick />} />
            <Route path="/receive" element={<Receive />} />
            <Route path="/grn" element={<GrnList />} />
            <Route path="/grn/new" element={<GrnNew />} />
            <Route path="/grn/:grnId" element={<GrnDetail />} />
            <Route path="/transfer" element={<Transfer />} />
            <Route path="/scan" element={<ScanHub />} />
            <Route path="/movements" element={<Movements />} />
            <Route path="/counts/:sessionId" element={<CountEntry />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/more" element={<More />} />

            {/* Admin only */}
            <Route element={<RequireAdmin />}>
              <Route path="/admin" element={<Dashboard />} />
              <Route path="/admin/alerts" element={<AlertCentre />} />
              <Route path="/admin/products" element={<AdminProducts />} />
              <Route path="/admin/products/new" element={<ProductForm />} />
              <Route path="/admin/products/:productId/edit" element={<ProductForm />} />
              <Route path="/admin/purchase-orders" element={<PurchaseOrders />} />
              <Route path="/admin/locations" element={<Locations />} />
              <Route path="/admin/import" element={<ImportPage />} />
              <Route path="/admin/export" element={<ExportPage />} />
              <Route path="/admin/expiry" element={<Expiry />} />
              <Route path="/admin/counts" element={<Counts />} />
              <Route path="/admin/users" element={<Users />} />
              <Route path="/admin/settings" element={<SettingsPage />} />
              <Route path="/admin/labels" element={<Labels />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  )
}
