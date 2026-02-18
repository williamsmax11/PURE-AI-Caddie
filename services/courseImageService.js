import { supabase } from '../config/supabase';
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';

const BUCKET_NAME = 'course-images';

/**
 * Upload a course image to Supabase Storage and create a database record.
 * @param {string} courseId - The course UUID
 * @param {string} imageUri - Local URI of the image (from image picker)
 * @param {string} userId - The uploading user's UUID
 * @returns {Promise<{data: object|null, error: string|null}>}
 */
export async function uploadCourseImage(courseId, imageUri, userId) {
  try {
    // Generate unique filename
    const timestamp = Date.now();
    const fileExt = imageUri.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `${courseId}/${timestamp}.${fileExt}`;

    // Check if file exists
    const fileInfo = await FileSystem.getInfoAsync(imageUri);
    if (!fileInfo.exists) {
      return { data: null, error: 'File not found' };
    }

    // Read the file as base64
    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: 'base64',
    });

    if (!base64) {
      return { data: null, error: 'Failed to read image file' };
    }

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, decode(base64), {
        contentType: `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`,
        upsert: false,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return { data: null, error: uploadError.message };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(fileName);

    const publicUrl = urlData?.publicUrl;

    if (!publicUrl) {
      return { data: null, error: 'Failed to get public URL' };
    }

    // Create database record
    const { data: dbData, error: dbError } = await supabase
      .from('courseimages')
      .insert({
        course_id: courseId,
        image_url: publicUrl,
        uploaded_by: userId,
        is_featured: false,
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database insert error:', dbError);
      // Try to clean up the uploaded file
      await supabase.storage.from(BUCKET_NAME).remove([fileName]);
      return { data: null, error: dbError.message };
    }

    return { data: dbData, error: null };
  } catch (error) {
    console.error('Upload course image error:', error);
    return { data: null, error: error.message };
  }
}

/**
 * Fetch all images for a course, ordered by featured first, then newest.
 * @param {string} courseId - The course UUID
 * @returns {Promise<{data: array, error: string|null}>}
 */
export async function fetchCourseImages(courseId) {
  const { data, error } = await supabase
    .from('courseimages')
    .select('*')
    .eq('course_id', courseId)
    .order('is_featured', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Fetch course images error:', error);
    return { data: [], error: error.message };
  }

  return { data: data || [], error: null };
}

/**
 * Get the main image for a course (featured > most recent > null).
 * @param {string} courseId - The course UUID
 * @returns {Promise<{data: object|null, error: string|null}>}
 */
export async function getCourseMainImage(courseId) {
  // First try to get featured image
  const { data: featured, error: featuredError } = await supabase
    .from('courseimages')
    .select('*')
    .eq('course_id', courseId)
    .eq('is_featured', true)
    .limit(1)
    .maybeSingle();

  if (featuredError) {
    console.error('Fetch featured image error:', featuredError);
  }

  if (featured) {
    return { data: featured, error: null };
  }

  // Fall back to most recent image
  const { data: recent, error: recentError } = await supabase
    .from('courseimages')
    .select('*')
    .eq('course_id', courseId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recentError) {
    console.error('Fetch recent image error:', recentError);
    return { data: null, error: recentError.message };
  }

  return { data: recent, error: null };
}

/**
 * Batch fetch main images for multiple courses.
 * Returns a map of courseId -> imageUrl for efficient lookup.
 * @param {string[]} courseIds - Array of course UUIDs
 * @returns {Promise<{data: Object<string, string>, error: string|null}>}
 */
export async function batchFetchMainImages(courseIds) {
  if (!courseIds || courseIds.length === 0) {
    return { data: {}, error: null };
  }

  // Fetch all images for these courses
  const { data, error } = await supabase
    .from('courseimages')
    .select('course_id, image_url, is_featured, created_at')
    .in('course_id', courseIds)
    .order('is_featured', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Batch fetch images error:', error);
    return { data: {}, error: error.message };
  }

  // Build map: courseId -> first (best) image URL
  const imageMap = {};
  for (const img of data || []) {
    // Only set if not already set (first one is best due to ordering)
    if (!imageMap[img.course_id]) {
      imageMap[img.course_id] = img.image_url;
    }
  }

  return { data: imageMap, error: null };
}

/**
 * Set an image as the featured image for a course.
 * Clears featured status from other images for the same course.
 * @param {string} imageId - The image UUID to feature
 * @param {string} courseId - The course UUID (for clearing others)
 * @returns {Promise<{data: object|null, error: string|null}>}
 */
export async function setFeaturedImage(imageId, courseId) {
  // First, clear featured from all images for this course
  const { error: clearError } = await supabase
    .from('courseimages')
    .update({ is_featured: false })
    .eq('course_id', courseId);

  if (clearError) {
    console.error('Clear featured error:', clearError);
    return { data: null, error: clearError.message };
  }

  // Set the new featured image
  const { data, error } = await supabase
    .from('courseimages')
    .update({ is_featured: true })
    .eq('id', imageId)
    .select()
    .single();

  if (error) {
    console.error('Set featured error:', error);
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

/**
 * Delete a course image.
 * @param {string} imageId - The image UUID to delete
 * @param {string} imageUrl - The image URL (to extract storage path)
 * @returns {Promise<{error: string|null}>}
 */
export async function deleteCourseImage(imageId, imageUrl) {
  try {
    // Delete from database first
    const { error: dbError } = await supabase
      .from('courseimages')
      .delete()
      .eq('id', imageId);

    if (dbError) {
      console.error('Delete image DB error:', dbError);
      return { error: dbError.message };
    }

    // Try to delete from storage (extract path from URL)
    // URL format: https://[project].supabase.co/storage/v1/object/public/course-images/[courseId]/[filename]
    const urlParts = imageUrl.split(`/storage/v1/object/public/${BUCKET_NAME}/`);
    if (urlParts.length === 2) {
      const filePath = urlParts[1];
      const { error: storageError } = await supabase.storage
        .from(BUCKET_NAME)
        .remove([filePath]);

      if (storageError) {
        console.warn('Storage delete warning:', storageError);
        // Don't fail the operation, DB record is already deleted
      }
    }

    return { error: null };
  } catch (error) {
    console.error('Delete course image error:', error);
    return { error: error.message };
  }
}
