import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../services/firebase';
import './Dashboard.css';
import { 
  collection, 
  getDocs,
  getDoc,
  query, 
  where, 
  updateDoc, 
  doc, 
  deleteDoc 
} from 'firebase/firestore';
import { api } from '../../services/api';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

const Dashboard = () => {
  const { isAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userDetails, setUserDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [statistics, setStatistics] = useState({
    totalUsers: 0,
    totalReviews: 0,
    totalFavorites: 0,
    totalWatchlist: 0,
    userActivityData: [],
    genreDistribution: []
  });

  useEffect(() => {
    if (isAdmin) {
      fetchAdminData();
    }
  }, [isAdmin]);

  const fetchAdminData = async () => {
    try {
      setLoading(true);
      setError(null);

      const usersRef = collection(db, 'users');
      const usersSnapshot = await getDocs(usersRef);
      const usersData = [];
      let totalFavorites = 0;
      let totalWatchlist = 0;
      const genreStats = {};
      const monthlyStats = {
        reviews: {},
        favorites: {},
        watchlist: {}
      };

      for (const doc of usersSnapshot.docs) {
        const userData = doc.data();
        const favorites = userData.favorites || [];
        const watchlist = userData.watchlist || [];

        usersData.push({
          id: doc.id,
          ...userData,
          favoritesCount: favorites.length,
          watchlistCount: watchlist.length
        });

        totalFavorites += favorites.length;
        totalWatchlist += watchlist.length;

        for (const animeId of favorites) {
          try {
            const animeData = await api.getAnimeById(animeId);
            if (animeData.data && animeData.data.genres) {
              animeData.data.genres.forEach(genre => {
                genreStats[genre.name] = (genreStats[genre.name] || 0) + 1;
              });
            }
          } catch (err) {
            console.error('Error fetching anime data:', err);
          }
        }
      }

      const reviewsRef = collection(db, 'reviews');
      const reviewsSnapshot = await getDocs(reviewsRef);
      const totalReviews = reviewsSnapshot.size;

      reviewsSnapshot.docs.forEach(doc => {
        const reviewData = doc.data();
        const date = new Date(reviewData.createdAt);
        const monthYear = `${date.getMonth() + 1}/${date.getFullYear()}`;
        monthlyStats.reviews[monthYear] = (monthlyStats.reviews[monthYear] || 0) + 1;
      });

      const genreDistribution = Object.entries(genreStats)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);

      const userActivityData = [];
      const today = new Date();
      for (let i = 5; i >= 0; i--) {
        const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const monthYear = `${date.getMonth() + 1}/${date.getFullYear()}`;
        userActivityData.push({
          month: new Date(date).toLocaleString('default', { month: 'short' }),
          reviews: monthlyStats.reviews[monthYear] || 0,
          favorites: monthlyStats.favorites[monthYear] || 0,
          watchlist: monthlyStats.watchlist[monthYear] || 0
        });
      }

      setUsers(usersData);
      setStatistics({
        totalUsers: usersData.length,
        totalReviews,
        totalFavorites,
        totalWatchlist,
        userActivityData,
        genreDistribution
      });

    } catch (err) {
      setError('Failed to load admin dashboard data');
      console.error('Admin dashboard error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUserRole = async (userId, newRole) => {
    try {
      if (!window.confirm(`Are you sure you want to change this user's role to ${newRole}?`)) {
        return;
      }

      setLoading(true);
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, { role: newRole });
      
      setUsers(users.map(user => 
        user.id === userId ? { ...user, role: newRole } : user
      ));

      alert('User role updated successfully');
    } catch (err) {
      console.error('Error updating user role:', err);
      setError('Failed to update user role');
    } finally {
      setLoading(false);
    }
  };

  const fetchUserDetails = async (userId) => {
    try {
      setLoading(true);
      const userRef = doc(db, 'users', userId);
      const userSnapshot = await getDoc(userRef);

      if (!userSnapshot.exists()) {
        throw new Error('User not found');
      }

      const userData = userSnapshot.data();

      const favorites = await Promise.all(
        (userData.favorites || []).map(async id => {
          try {
            const response = await api.getAnimeById(id);
            return response;
          } catch (err) {
            console.error(`Error fetching anime ${id}:`, err);
            return null;
          }
        })
      );

      const watchlist = await Promise.all(
        (userData.watchlist || []).map(async id => {
          try {
            const response = await api.getAnimeById(id);
            return response;
          } catch (err) {
            console.error(`Error fetching anime ${id}:`, err);
            return null;
          }
        })
      );

      const reviewsRef = collection(db, 'reviews');
      const reviewsQuery = query(reviewsRef, where('userId', '==', userId));
      const reviewsSnapshot = await getDocs(reviewsQuery);
      const reviews = await Promise.all(
        reviewsSnapshot.docs.map(async doc => {
          try {
            const reviewData = doc.data();
            const animeDetails = await api.getAnimeById(reviewData.animeId);
            return {
              id: doc.id,
              ...reviewData,
              anime: animeDetails.data
            };
          } catch (err) {
            console.error(`Error fetching review details:`, err);
            return null;
          }
        })
      );

      setUserDetails({
        ...userData,
        favorites: favorites.filter(Boolean).map(response => response.data),
        watchlist: watchlist.filter(Boolean).map(response => response.data),
        reviews: reviews.filter(Boolean)
      });
    } catch (err) {
      console.error('Error fetching user details:', err);
      setError('Failed to load user details');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUserItem = async (userId, itemType, itemId) => {
    if (!window.confirm(`Are you sure you want to delete this ${itemType}?`)) {
      return;
    }
  
    try {
      setLoading(true);
      const userRef = doc(db, 'users', userId);
  
      switch (itemType) {
        case 'favorite':
          // 1. Get current user document first
          const userSnapshot = await getDoc(userRef);
          if (!userSnapshot.exists()) {
            throw new Error('User not found');
          }
  
          // 2. Get current favorites array
          const userData = userSnapshot.data();
          const currentFavorites = userData.favorites || [];
  
          // 3. Remove the specific anime ID from favorites
          const updatedFavorites = currentFavorites.filter(
            favoriteId => favoriteId !== itemId.toString()
          );
  
          // 4. Update the document in Firestore
          await updateDoc(userRef, {
            favorites: updatedFavorites
          });
  
          // 5. Update local state
          setUserDetails(prev => ({
            ...prev,
            favorites: prev.favorites.filter(anime => anime.mal_id !== itemId)
          }));
  
          // 6. Update users list state
          setUsers(users.map(user => {
            if (user.id === userId) {
              return {
                ...user,
                favoritesCount: user.favoritesCount - 1
              };
            }
            return user;
          }));
  
          break;
  
        case 'review':
          const reviewRef = doc(db, 'reviews', itemId);
          await deleteDoc(reviewRef);
          setUserDetails(prev => ({
            ...prev,
            reviews: prev.reviews.filter(review => review.id !== itemId)
          }));
          break;
  
        default:
          throw new Error('Invalid item type');
      }
  
      alert(`${itemType} deleted successfully`);
    } catch (err) {
      console.error(`Error deleting ${itemType}:`, err);
      setError(`Failed to delete ${itemType}. Please try again.`);
    } finally {
      setLoading(false);
    }
  };
  const filteredUsers = users.filter(user => {
    const matchesSearch = user?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false;
    const matchesRole = filterRole === 'all' || user?.role === filterRole;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="admin-dashboard">
      <div className="dashboard-header">
        <h1>Admin Dashboard</h1>
        <div className="statistics-cards">
          <div className="stat-card">
            <div className="stat-icon users-icon">👥</div>
            <div className="stat-info">
              <h3>Total Users</h3>
              <p>{statistics.totalUsers}</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon reviews-icon">✍️</div>
            <div className="stat-info">
              <h3>Total Reviews</h3>
              <p>{statistics.totalReviews}</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon favorites-icon">❤️</div>
            <div className="stat-info">
              <h3>Total Favorites</h3>
              <p>{statistics.totalFavorites}</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon watchlist-icon">📺</div>
            <div className="stat-info">
              <h3>Total Watchlist</h3>
              <p>{statistics.totalWatchlist}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="analytics-section">
        <div className="chart-container">
          <h2>Monthly Activity Overview</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={statistics.userActivityData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="reviews" fill="#8884d8" name="Reviews" />
              <Bar dataKey="favorites" fill="#82ca9d" name="Favorites" />
              <Bar dataKey="watchlist" fill="#ffc658" name="Watchlist" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-container">
          <h2>Popular Genres</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={statistics.genreDistribution}
                cx="50%"
                cy="50%"
                labelLine={false}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {statistics.genreDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="users-section">
        <div className="users-controls">
          <input
            type="text"
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="role-filter"
          >
            <option value="all">All Roles</option>
            <option value="user">Users</option>
            <option value="admin">Admins</option>
          </select>
        </div>

        <div className="users-list">
          <h2>Users Management</h2>
          <table className="users-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Favorites</th>
                <th>Watchlist</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(user => (
                <tr key={user.id}>
                  <td>{user.email}</td>
                  <td>
                    <select
                      value={user.role}
                      onChange={(e) => handleUpdateUserRole(user.id, e.target.value)}
                      className="role-select"
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td>{user.favoritesCount}</td>
                  <td>{user.watchlistCount}</td>
                  <td>
                    <button
                      onClick={() => {
                        setSelectedUser(user);
                        fetchUserDetails(user.id);
                      }}
                      className="view-details-button"
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selectedUser && userDetails && (
          <div className="user-details-panel">
            <h2>User Details: {selectedUser.email}</h2>
            <div className="user-details-content">
              <div className="details-section">
                <h3>Favorites ({userDetails.favorites.length})</h3>
                <div className="anime-grid">
                  {userDetails.favorites.map(anime => (
                    <div key={anime.mal_id} className="anime-card">
                      <img src={anime.images.jpg.image_url} alt={anime.title} />
                      <div className="anime-info">
                        <h4>{anime.title}</h4>
                        <button
  onClick={() => handleDeleteUserItem(selectedUser.id, 'favorite', anime.mal_id.toString())}
  className="delete-button"
  disabled={loading}
>
  {loading ? 'Removing...' : 'Remove'}
</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="details-section">
                <h3>Reviews ({userDetails.reviews.length})</h3>
                <div className="reviews-list">
                  {userDetails.reviews.map(review => (
                    <div key={review.id} className="review-card">
                      <div className="review-header">
                        <h4>{review.anime.title}</h4>
                        <span>{new Date(review.createdAt).toLocaleDateString()}</span>
                      </div>
                      <p>{review.content}</p>
                      <button
                        onClick={() => handleDeleteUserItem(selectedUser.id, 'review', review.id)}
                        className="delete-button"
                      >
                        Delete Review
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                setSelectedUser(null);
                setUserDetails(null);
              }}
              className="close-button"
            >
              Close Details
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;